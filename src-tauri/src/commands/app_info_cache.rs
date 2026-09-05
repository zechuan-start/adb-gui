use base64::Engine;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

use super::app_info::{AppIconEntry, AppInfo};
use crate::device_helper::fnv1a_64;

const CACHE_VERSION: u32 = 1;
const PNG_DATA_URI_PREFIX: &str = "data:image/png;base64,";
const PNG_MAGIC: &[u8; 4] = b"\x89PNG";
const MAX_READABLE_ICON_FILE_NAME: usize = 200;

static DEVICE_CACHE_LOCKS: OnceLock<Mutex<HashMap<String, Arc<Mutex<()>>>>> = OnceLock::new();

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct CachedApp {
    package_name: String,
    app_name: String,
    version_name: String,
    version_code: i64,
    first_install_time: i64,
    last_update_time: i64,
    apk_size: i64,
    icon_file: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct CacheIndex {
    version: u32,
    device_key: String,
    updated_at: i64,
    apps: Vec<CachedApp>,
}

#[tauri::command(async)]
pub fn read_app_info_cache(app: AppHandle, device_key: String) -> Result<Vec<AppInfo>, String> {
    let Ok(root) = cache_root(&app) else {
        return Ok(Vec::new());
    };
    let sanitized_key = sanitize_device_key(&device_key);
    Ok(read_cache_locked(&root, &sanitized_key))
}

#[tauri::command(async)]
pub fn write_app_info_cache(
    app: AppHandle,
    device_key: String,
    apps: Vec<AppInfo>,
    new_icons: Vec<AppIconEntry>,
) -> Result<(), String> {
    let root = cache_root(&app)?;
    let sanitized_key = sanitize_device_key(&device_key);
    write_cache_locked(&root, &sanitized_key, &apps, &new_icons)
}

fn write_cache_locked(
    root: &Path,
    device_key: &str,
    apps: &[AppInfo],
    new_icons: &[AppIconEntry],
) -> Result<(), String> {
    with_device_cache_lock(device_key, || {
        write_cache(root, device_key, apps, new_icons)
    })
}

fn read_cache_locked(root: &Path, device_key: &str) -> Vec<AppInfo> {
    with_device_cache_lock(device_key, || read_cache(root, device_key))
}

fn with_device_cache_lock<T>(device_key: &str, operation: impl FnOnce() -> T) -> T {
    let device_lock = device_cache_lock(device_key);
    let _guard = device_lock
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    operation()
}

fn cache_root(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_cache_dir()
        .map(|path| path.join("app-info"))
        .map_err(|error| format!("Failed to locate application cache directory: {error}"))
}

fn device_cache_lock(device_key: &str) -> Arc<Mutex<()>> {
    let locks = DEVICE_CACHE_LOCKS.get_or_init(|| Mutex::new(HashMap::new()));
    let mut locks = locks
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    locks
        .entry(device_key.to_string())
        .or_insert_with(|| Arc::new(Mutex::new(())))
        .clone()
}

fn sanitize_device_key(raw: &str) -> String {
    let prefix: String = raw
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-') {
                character
            } else {
                '_'
            }
        })
        .take(64)
        .collect();
    format!("{prefix}-{:016x}", fnv1a_64(raw.as_bytes()))
}

fn icon_file_name(package_name: &str, last_update_time: i64) -> String {
    let readable = format!("{package_name}@{last_update_time}.png");
    if readable.len() <= MAX_READABLE_ICON_FILE_NAME {
        readable
    } else {
        format!(
            "{:016x}@{last_update_time}.png",
            fnv1a_64(package_name.as_bytes())
        )
    }
}

fn decode_icon_data_uri(data_uri: &str) -> Option<Vec<u8>> {
    let encoded = data_uri.strip_prefix(PNG_DATA_URI_PREFIX)?;
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .ok()?;
    is_png(&decoded).then_some(decoded)
}

fn is_png(bytes: &[u8]) -> bool {
    bytes.starts_with(PNG_MAGIC)
}

fn is_safe_icon_file(icon_file: &str, package_name: &str, last_update_time: i64) -> bool {
    !icon_file.is_empty()
        && icon_file == icon_file_name(package_name, last_update_time)
        && !Path::new(icon_file).is_absolute()
        && !icon_file.contains("..")
        && !icon_file.contains('/')
        && !icon_file.contains('\\')
}

fn load_valid_index(device_dir: &Path, device_key: &str) -> Option<CacheIndex> {
    let bytes = fs::read(device_dir.join("index.json")).ok()?;
    let index: CacheIndex = serde_json::from_slice(&bytes).ok()?;
    (index.version == CACHE_VERSION && index.device_key == device_key).then_some(index)
}

fn read_cache(root: &Path, device_key: &str) -> Vec<AppInfo> {
    let device_dir = root.join(device_key);
    let Some(index) = load_valid_index(&device_dir, device_key) else {
        let _ = fs::remove_dir_all(&device_dir);
        return Vec::new();
    };
    let icons_dir = device_dir.join("icons");

    index
        .apps
        .into_iter()
        .filter(|cached| cached.last_update_time > 0)
        .map(|cached| {
            let icon = read_cached_icon(&icons_dir, &cached);
            AppInfo {
                package_name: cached.package_name,
                app_name: cached.app_name,
                version_name: cached.version_name,
                version_code: cached.version_code,
                icon,
                first_install_time: cached.first_install_time,
                last_update_time: cached.last_update_time,
                apk_size: cached.apk_size,
            }
        })
        .collect()
}

fn read_cached_icon(icons_dir: &Path, cached: &CachedApp) -> String {
    if !is_safe_icon_file(
        &cached.icon_file,
        &cached.package_name,
        cached.last_update_time,
    ) {
        return String::new();
    }
    let Ok(bytes) = fs::read(icons_dir.join(&cached.icon_file)) else {
        return String::new();
    };
    if !is_png(&bytes) {
        return String::new();
    }
    format!(
        "{PNG_DATA_URI_PREFIX}{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    )
}

fn write_cache(
    root: &Path,
    device_key: &str,
    apps: &[AppInfo],
    new_icons: &[AppIconEntry],
) -> Result<(), String> {
    let device_dir = root.join(device_key);
    let icons_dir = device_dir.join("icons");
    fs::create_dir_all(&icons_dir).map_err(|error| {
        format!(
            "Failed to create app-info cache directory at {}: {error}",
            icons_dir.display()
        )
    })?;

    let previous = load_valid_index(&device_dir, device_key);
    let previous_icons = previous_icon_files(previous.as_ref());
    let decoded_icons = decoded_icons_by_package(new_icons);
    let mut cached_apps = Vec::new();

    for app in apps.iter().filter(|app| app.last_update_time > 0) {
        let icon_file = choose_icon_file(
            app,
            decoded_icons.get(&app.package_name),
            &previous_icons,
            &icons_dir,
        )?;
        cached_apps.push(CachedApp {
            package_name: app.package_name.clone(),
            app_name: app.app_name.clone(),
            version_name: app.version_name.clone(),
            version_code: app.version_code,
            first_install_time: app.first_install_time,
            last_update_time: app.last_update_time,
            apk_size: app.apk_size,
            icon_file,
        });
    }

    let index = CacheIndex {
        version: CACHE_VERSION,
        device_key: device_key.to_string(),
        updated_at: now_millis(),
        apps: cached_apps,
    };
    write_index(&device_dir, &index)?;
    prune_icons(&icons_dir, &index).map_err(|error| {
        format!(
            "Failed to prune app-info cache icons at {}: {error}",
            icons_dir.display()
        )
    })
}

fn previous_icon_files(index: Option<&CacheIndex>) -> HashMap<(String, i64), String> {
    index
        .into_iter()
        .flat_map(|index| &index.apps)
        .filter(|cached| {
            is_safe_icon_file(
                &cached.icon_file,
                &cached.package_name,
                cached.last_update_time,
            )
        })
        .map(|cached| {
            (
                (cached.package_name.clone(), cached.last_update_time),
                cached.icon_file.clone(),
            )
        })
        .collect()
}

fn decoded_icons_by_package(new_icons: &[AppIconEntry]) -> HashMap<String, Vec<u8>> {
    new_icons
        .iter()
        .filter_map(|entry| {
            decode_icon_data_uri(&entry.icon).map(|decoded| (entry.package_name.clone(), decoded))
        })
        .collect()
}

fn choose_icon_file(
    app: &AppInfo,
    new_icon: Option<&Vec<u8>>,
    previous_icons: &HashMap<(String, i64), String>,
    icons_dir: &Path,
) -> Result<String, String> {
    let expected = icon_file_name(&app.package_name, app.last_update_time);
    if !is_safe_icon_file(&expected, &app.package_name, app.last_update_time) {
        return Ok(String::new());
    }

    if let Some(bytes) = new_icon {
        let path = icons_dir.join(&expected);
        fs::write(&path, bytes).map_err(|error| {
            format!(
                "Failed to write app-info cache icon at {}: {error}",
                path.display()
            )
        })?;
        return Ok(expected);
    }

    let key = (app.package_name.clone(), app.last_update_time);
    let Some(previous) = previous_icons.get(&key) else {
        return Ok(String::new());
    };
    let valid = fs::read(icons_dir.join(previous))
        .ok()
        .is_some_and(|bytes| is_png(&bytes));
    Ok(if valid {
        previous.clone()
    } else {
        String::new()
    })
}

fn write_index(device_dir: &Path, index: &CacheIndex) -> Result<(), String> {
    let index_path = device_dir.join("index.json");
    let temp_path = device_dir.join(format!(".index.{}.{}.tmp", std::process::id(), now_nanos()));
    let json = serde_json::to_vec(index)
        .map_err(|error| format!("Failed to serialize app-info cache index: {error}"))?;
    if let Err(error) = fs::write(&temp_path, json) {
        let _ = fs::remove_file(&temp_path);
        return Err(format!(
            "Failed to write app-info cache index at {}: {error}",
            temp_path.display()
        ));
    }
    replace_cache_index(&temp_path, &index_path).map_err(|error| {
        format!(
            "Failed to replace app-info cache index at {}: {error}",
            index_path.display()
        )
    })
}

#[cfg(not(windows))]
fn replace_cache_index(temp_path: &Path, index_path: &Path) -> io::Result<()> {
    if let Err(error) = fs::rename(temp_path, index_path) {
        let _ = fs::remove_file(temp_path);
        return Err(error);
    }
    Ok(())
}

#[cfg(windows)]
fn replace_cache_index(temp_path: &Path, index_path: &Path) -> io::Result<()> {
    if let Err(error) = fs::remove_file(index_path) {
        if error.kind() != io::ErrorKind::NotFound {
            let _ = fs::remove_file(temp_path);
            return Err(error);
        }
    }
    if let Err(error) = fs::rename(temp_path, index_path) {
        let _ = fs::remove_file(temp_path);
        return Err(error);
    }
    Ok(())
}

fn prune_icons(icons_dir: &Path, index: &CacheIndex) -> io::Result<()> {
    let referenced: HashSet<&str> = index
        .apps
        .iter()
        .filter_map(|app| (!app.icon_file.is_empty()).then_some(app.icon_file.as_str()))
        .collect();
    for entry in fs::read_dir(icons_dir)? {
        let entry = entry?;
        let file_name = entry.file_name();
        let Some(file_name) = file_name.to_str() else {
            continue;
        };
        let file_type = entry.file_type()?;
        if (file_type.is_file() || file_type.is_symlink()) && !referenced.contains(file_name) {
            fs::remove_file(entry.path())?;
        }
    }
    Ok(())
}

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(i64::MAX as u128) as i64
}

fn now_nanos() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos()
}

#[cfg(test)]
mod tests {
    use super::*;

    const PNG_ONE: &[u8] = b"\x89PNG-one";
    const PNG_TWO: &[u8] = b"\x89PNG-two";

    fn temp_cache_root(label: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "adb-gui-app-info-cache-{label}-{}-{}",
            std::process::id(),
            now_nanos()
        ));
        fs::create_dir_all(&path).expect("temporary cache root should be created");
        path
    }

    fn app(package_name: &str, last_update_time: i64) -> AppInfo {
        AppInfo {
            package_name: package_name.to_string(),
            app_name: format!("App {package_name}"),
            version_name: "1.0".to_string(),
            version_code: 1,
            icon: String::new(),
            first_install_time: 10,
            last_update_time,
            apk_size: 20,
        }
    }

    fn icon(package_name: &str, bytes: &[u8]) -> AppIconEntry {
        AppIconEntry {
            package_name: package_name.to_string(),
            icon: format!(
                "{PNG_DATA_URI_PREFIX}{}",
                base64::engine::general_purpose::STANDARD.encode(bytes)
            ),
        }
    }

    fn device_dir(root: &Path, raw_key: &str) -> PathBuf {
        root.join(sanitize_device_key(raw_key))
    }

    #[test]
    fn sanitizes_device_keys_without_collisions() {
        let wifi = sanitize_device_key("192.168.1.5:5555");
        let underscored = sanitize_device_key("192.168.1.5_5555");
        assert!(wifi.starts_with("192.168.1.5_5555-"));
        assert!(sanitize_device_key("ABC123").starts_with("ABC123-"));
        assert_ne!(wifi, underscored);

        let long = sanitize_device_key(&"a".repeat(100));
        assert_eq!(long.split('-').next().unwrap().len(), 64);

        let first = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa5k1rfomkqh3p";
        let second =
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaf3ifpd1e5dtut";
        assert_eq!(
            fnv1a_64(first.as_bytes()) as u32,
            fnv1a_64(second.as_bytes()) as u32
        );
        assert_ne!(fnv1a_64(first.as_bytes()), fnv1a_64(second.as_bytes()));
        assert_ne!(sanitize_device_key(first), sanitize_device_key(second));
    }

    #[test]
    fn builds_stable_bounded_icon_file_names() {
        assert_eq!(
            icon_file_name("com.example.app", 123),
            "com.example.app@123.png"
        );
        assert_eq!(
            icon_file_name("com.example.app", 123),
            icon_file_name("com.example.app", 123)
        );
        let long = icon_file_name(&format!("com.example.{}", "a".repeat(220)), 123);
        assert_eq!(long.len(), 16 + 1 + 3 + 4);
        assert!(!long.contains("com.example"));
    }

    #[test]
    fn validates_png_data_uris() {
        let valid = icon("com.example.app", PNG_ONE).icon;
        assert_eq!(decode_icon_data_uri(&valid), Some(PNG_ONE.to_vec()));
        assert_eq!(decode_icon_data_uri("data:image/jpeg;base64,AAAA"), None);
        assert_eq!(decode_icon_data_uri("data:image/png;base64,%%%"), None);
        assert_eq!(
            decode_icon_data_uri("data:image/png;base64,bm90LXBuZw=="),
            None
        );
    }

    #[test]
    fn writes_and_reads_round_trip_while_skipping_unstable_timestamps() {
        let root = temp_cache_root("round-trip");
        let raw_key = "192.168.1.5:5555";
        let stable = app("com.example.stable", 100);
        let unstable = app("com.example.unstable", 0);

        write_cache(
            &root,
            &sanitize_device_key(raw_key),
            &[stable.clone(), unstable],
            &[icon(&stable.package_name, PNG_ONE)],
        )
        .expect("cache write should succeed");

        let read = read_cache(&root, &sanitize_device_key(raw_key));
        assert_eq!(read.len(), 1);
        assert_eq!(read[0].package_name, stable.package_name);
        assert_eq!(decode_icon_data_uri(&read[0].icon), Some(PNG_ONE.to_vec()));
        let index: CacheIndex = serde_json::from_slice(
            &fs::read(device_dir(&root, raw_key).join("index.json")).unwrap(),
        )
        .unwrap();
        assert_eq!(index.apps.len(), 1);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn invalid_index_clears_only_that_device_directory() {
        let root = temp_cache_root("invalid-index");
        let raw_key = "device-a";
        let dir = device_dir(&root, raw_key);
        fs::create_dir_all(&dir).unwrap();
        let incompatible = CacheIndex {
            version: 99,
            device_key: sanitize_device_key(raw_key),
            updated_at: 1,
            apps: Vec::new(),
        };
        fs::write(
            dir.join("index.json"),
            serde_json::to_vec(&incompatible).unwrap(),
        )
        .unwrap();

        assert!(read_cache(&root, &sanitize_device_key(raw_key)).is_empty());
        assert!(!dir.exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn keeps_device_caches_isolated() {
        let root = temp_cache_root("device-isolation");
        let first_key = sanitize_device_key("device-a");
        let second_key = sanitize_device_key("device-b");
        let first_app = app("com.example.first", 100);
        let second_app = app("com.example.second", 200);
        write_cache(
            &root,
            &first_key,
            std::slice::from_ref(&first_app),
            &[icon(&first_app.package_name, PNG_ONE)],
        )
        .unwrap();
        write_cache(
            &root,
            &second_key,
            std::slice::from_ref(&second_app),
            &[icon(&second_app.package_name, PNG_TWO)],
        )
        .unwrap();

        assert_eq!(
            read_cache(&root, &first_key)[0].package_name,
            first_app.package_name
        );
        assert_eq!(
            read_cache(&root, &second_key)[0].package_name,
            second_app.package_name
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn a_missing_icon_only_invalidates_that_entry() {
        let root = temp_cache_root("missing-icon");
        let key = sanitize_device_key("device-a");
        let one = app("com.example.one", 100);
        let two = app("com.example.two", 200);
        write_cache(
            &root,
            &key,
            &[one.clone(), two.clone()],
            &[
                icon(&one.package_name, PNG_ONE),
                icon(&two.package_name, PNG_TWO),
            ],
        )
        .unwrap();
        fs::remove_file(
            root.join(&key)
                .join("icons")
                .join(icon_file_name(&one.package_name, one.last_update_time)),
        )
        .unwrap();

        let read = read_cache(&root, &key);
        assert_eq!(read.len(), 2);
        assert!(read
            .iter()
            .find(|item| item.package_name == one.package_name)
            .unwrap()
            .icon
            .is_empty());
        assert!(!read
            .iter()
            .find(|item| item.package_name == two.package_name)
            .unwrap()
            .icon
            .is_empty());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn a_corrupt_icon_only_invalidates_that_entry() {
        let root = temp_cache_root("corrupt-icon");
        let key = sanitize_device_key("device-a");
        let one = app("com.example.one", 100);
        let two = app("com.example.two", 200);
        write_cache(
            &root,
            &key,
            &[one.clone(), two.clone()],
            &[
                icon(&one.package_name, PNG_ONE),
                icon(&two.package_name, PNG_TWO),
            ],
        )
        .unwrap();
        fs::write(
            root.join(&key)
                .join("icons")
                .join(icon_file_name(&one.package_name, one.last_update_time)),
            b"not-png",
        )
        .unwrap();

        let read = read_cache(&root, &key);
        assert!(read
            .iter()
            .find(|item| item.package_name == one.package_name)
            .unwrap()
            .icon
            .is_empty());
        assert!(!read
            .iter()
            .find(|item| item.package_name == two.package_name)
            .unwrap()
            .icon
            .is_empty());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn repeated_writes_preserve_matching_icons_and_prune_removed_entries() {
        let root = temp_cache_root("preserve-and-prune");
        let key = sanitize_device_key("device-a");
        let one = app("com.example.one", 100);
        let two = app("com.example.two", 200);
        write_cache(
            &root,
            &key,
            &[one.clone(), two.clone()],
            &[
                icon(&one.package_name, PNG_ONE),
                icon(&two.package_name, PNG_TWO),
            ],
        )
        .unwrap();

        write_cache(&root, &key, &[one.clone(), two.clone()], &[]).unwrap();
        let preserved = read_cache(&root, &key);
        assert!(preserved.iter().all(|item| !item.icon.is_empty()));

        write_cache(
            &root,
            &key,
            std::slice::from_ref(&one),
            &[icon(&one.package_name, PNG_TWO)],
        )
        .unwrap();
        let read = read_cache(&root, &key);
        assert_eq!(read.len(), 1);
        assert_eq!(decode_icon_data_uri(&read[0].icon), Some(PNG_TWO.to_vec()));
        assert!(!root
            .join(&key)
            .join("icons")
            .join(icon_file_name(&two.package_name, two.last_update_time))
            .exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn updating_one_icon_keeps_other_exact_matches() {
        let root = temp_cache_root("partial-update");
        let key = sanitize_device_key("device-a");
        let one = app("com.example.one", 100);
        let two = app("com.example.two", 200);
        write_cache(
            &root,
            &key,
            &[one.clone(), two.clone()],
            &[
                icon(&one.package_name, PNG_ONE),
                icon(&two.package_name, PNG_ONE),
            ],
        )
        .unwrap();
        write_cache(
            &root,
            &key,
            &[one.clone(), two.clone()],
            &[icon(&one.package_name, PNG_TWO)],
        )
        .unwrap();

        let read = read_cache(&root, &key);
        let one_read = read
            .iter()
            .find(|item| item.package_name == one.package_name)
            .unwrap();
        let two_read = read
            .iter()
            .find(|item| item.package_name == two.package_name)
            .unwrap();
        assert_eq!(decode_icon_data_uri(&one_read.icon), Some(PNG_TWO.to_vec()));
        assert_eq!(decode_icon_data_uri(&two_read.icon), Some(PNG_ONE.to_vec()));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn invalid_new_icons_do_not_replace_valid_previous_icons() {
        let root = temp_cache_root("invalid-new-icon");
        let key = sanitize_device_key("device-a");
        let one = app("com.example.one", 100);
        write_cache(
            &root,
            &key,
            std::slice::from_ref(&one),
            &[icon(&one.package_name, PNG_ONE)],
        )
        .unwrap();
        write_cache(
            &root,
            &key,
            std::slice::from_ref(&one),
            &[AppIconEntry {
                package_name: one.package_name.clone(),
                icon: "data:image/png;base64,bm90LXBuZw==".to_string(),
            }],
        )
        .unwrap();

        let read = read_cache(&root, &key);
        assert_eq!(decode_icon_data_uri(&read[0].icon), Some(PNG_ONE.to_vec()));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_untrusted_icon_paths_without_leaving_the_device_directory() {
        let root = temp_cache_root("unsafe-path");
        let key = sanitize_device_key("device-a");
        let dir = root.join(&key);
        fs::create_dir_all(dir.join("icons")).unwrap();
        let cached = CachedApp {
            package_name: "com.example.app".to_string(),
            app_name: "Example".to_string(),
            version_name: "1".to_string(),
            version_code: 1,
            first_install_time: 1,
            last_update_time: 100,
            apk_size: 1,
            icon_file: "../outside.png".to_string(),
        };
        let index = CacheIndex {
            version: CACHE_VERSION,
            device_key: key.clone(),
            updated_at: 1,
            apps: vec![cached],
        };
        fs::write(dir.join("index.json"), serde_json::to_vec(&index).unwrap()).unwrap();

        let read = read_cache(&root, &key);
        assert_eq!(read.len(), 1);
        assert!(read[0].icon.is_empty());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_absolute_parent_and_separator_icon_references() {
        assert!(!is_safe_icon_file(
            "/tmp/com.example.app@100.png",
            "com.example.app",
            100
        ));
        assert!(!is_safe_icon_file(
            "../com.example.app@100.png",
            "com.example.app",
            100
        ));
        assert!(!is_safe_icon_file(
            "icons/com.example.app@100.png",
            "com.example.app",
            100
        ));
        assert!(!is_safe_icon_file(
            "icons\\com.example.app@100.png",
            "com.example.app",
            100
        ));
    }

    #[test]
    fn serializes_writes_that_share_one_device_key() {
        let root = temp_cache_root("concurrent-write");
        let key = sanitize_device_key("physical-a");
        let one = app("com.example.one", 100);
        let two = app("com.example.two", 200);
        let apps = Arc::new(vec![one.clone(), two.clone()]);

        let first_root = root.clone();
        let first_key = key.clone();
        let first_apps = Arc::clone(&apps);
        let first = std::thread::spawn(move || {
            write_cache_locked(
                &first_root,
                &first_key,
                &first_apps,
                &[icon("com.example.one", PNG_ONE)],
            )
        });
        let second_root = root.clone();
        let second_key = key.clone();
        let second_apps = Arc::clone(&apps);
        let second = std::thread::spawn(move || {
            write_cache_locked(
                &second_root,
                &second_key,
                &second_apps,
                &[icon("com.example.two", PNG_TWO)],
            )
        });

        first.join().unwrap().unwrap();
        second.join().unwrap().unwrap();
        let read = read_cache(&root, &key);
        assert_eq!(read.len(), 2);
        assert!(read.iter().all(|item| !item.icon.is_empty()));
        let index: CacheIndex =
            serde_json::from_slice(&fs::read(root.join(&key).join("index.json")).unwrap()).unwrap();
        assert!(index.apps.iter().all(|item| {
            !item.icon_file.is_empty()
                && root
                    .join(&key)
                    .join("icons")
                    .join(&item.icon_file)
                    .is_file()
        }));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn reads_wait_for_the_device_cache_lock() {
        let root = temp_cache_root("concurrent-read-write");
        let key = sanitize_device_key("physical-a");
        let cached = app("com.example.one", 100);
        write_cache_locked(
            &root,
            &key,
            std::slice::from_ref(&cached),
            &[icon(&cached.package_name, PNG_ONE)],
        )
        .unwrap();

        let device_lock = device_cache_lock(&key);
        let guard = device_lock.lock().unwrap();
        let reader_root = root.clone();
        let reader_key = key.clone();
        let (result_tx, result_rx) = std::sync::mpsc::channel();
        let reader = std::thread::spawn(move || {
            result_tx
                .send(read_cache_locked(&reader_root, &reader_key))
                .unwrap();
        });

        assert!(result_rx
            .recv_timeout(std::time::Duration::from_millis(50))
            .is_err());
        drop(guard);

        let read = result_rx
            .recv_timeout(std::time::Duration::from_secs(1))
            .unwrap();
        reader.join().unwrap();
        assert_eq!(read.len(), 1);
        assert_eq!(read[0].package_name, cached.package_name);
        assert!(!read[0].icon.is_empty());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn replaces_an_existing_index() {
        let root = temp_cache_root("replace-index");
        let index_path = root.join("index.json");
        let temp_path = root.join("index.tmp");
        fs::write(&index_path, b"old").unwrap();
        fs::write(&temp_path, b"new").unwrap();

        replace_cache_index(&temp_path, &index_path).unwrap();
        assert_eq!(fs::read(&index_path).unwrap(), b"new");
        assert!(!temp_path.exists());
        fs::remove_dir_all(root).unwrap();
    }
}
