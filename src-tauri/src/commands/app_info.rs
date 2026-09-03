use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Output, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use std::time::Duration;
use tauri::{AppHandle, Manager};

use crate::adb;

use super::device::adb_output_error;

// Keep this value in sync with scripts/build-app-info-dex/.../Main.java.
const PAYLOAD_SENTINEL: &str = "--ADBGUI-APPINFO-V1--";
const REMOTE_DEX_DIR: &str = "/data/local/tmp";
const REMOTE_DEX_PREFIX: &str = "adb-gui-app-info-";
const METADATA_TIMEOUT: Duration = Duration::from_secs(45);
const ICONS_TIMEOUT: Duration = Duration::from_secs(90);
const PUSH_TIMEOUT: Duration = Duration::from_secs(30);
const ICON_FILTER_BATCH: usize = 50;
const MAX_ERROR_DETAIL_BYTES: usize = 4_000;

static FORCE_PUSH_NEXT: AtomicBool = AtomicBool::new(false);
static HELPER_LOCK: OnceLock<tokio::sync::Mutex<()>> = OnceLock::new();

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub package_name: String,
    pub app_name: String,
    pub version_name: String,
    pub version_code: i64,
    pub icon: String,
    pub first_install_time: i64,
    pub last_update_time: i64,
    pub apk_size: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppIconEntry {
    pub package_name: String,
    pub icon: String,
}

#[derive(Clone, Copy)]
enum HelperMode {
    Metadata,
    Icons,
}

impl HelperMode {
    fn argument(self) -> &'static str {
        match self {
            Self::Metadata => "--no-icons",
            Self::Icons => "--icons-only",
        }
    }

    fn timeout(self) -> Duration {
        match self {
            Self::Metadata => METADATA_TIMEOUT,
            Self::Icons => ICONS_TIMEOUT,
        }
    }

    fn description(self) -> &'static str {
        match self {
            Self::Metadata => "app-info metadata helper",
            Self::Icons => "app-info icon helper",
        }
    }
}

#[tauri::command]
pub async fn get_installed_apps(app: AppHandle, serial: String) -> Result<Vec<AppInfo>, String> {
    run_app_info_helper(&app, &serial, HelperMode::Metadata, &[]).await
}

#[tauri::command]
pub async fn get_installed_app_icons(
    app: AppHandle,
    serial: String,
    packages: Option<Vec<String>>,
) -> Result<Vec<AppIconEntry>, String> {
    let batches = prepare_icon_batches(packages)?;
    let mut icons = Vec::new();

    for batch in batches {
        icons.extend(
            run_app_info_helper(&app, &serial, HelperMode::Icons, &batch).await?,
        );
    }

    Ok(icons)
}

fn helper_lock() -> &'static tokio::sync::Mutex<()> {
    HELPER_LOCK.get_or_init(|| tokio::sync::Mutex::new(()))
}

async fn run_app_info_helper<T: DeserializeOwned>(
    app: &AppHandle,
    serial: &str,
    mode: HelperMode,
    packages: &[String],
) -> Result<Vec<T>, String> {
    let _guard = helper_lock().lock().await;
    let dex_path = resolve_app_info_dex_path(app)?;
    let dex = fs::read(&dex_path).map_err(|error| {
        format!(
            "Failed to read bundled app-info.dex at {}: {error}",
            dex_path.display()
        )
    })?;
    let remote_path = remote_dex_path(fnv1a_64(&dex));
    let expected_size = dex.len() as u64;
    let force_push = FORCE_PUSH_NEXT.swap(false, Ordering::AcqRel);

    let pushed = match ensure_dex_pushed(
        app,
        serial,
        &dex_path,
        &remote_path,
        expected_size,
        force_push,
    )
    .await
    {
        Ok(pushed) => pushed,
        Err(first_error) => ensure_dex_pushed(
            app,
            serial,
            &dex_path,
            &remote_path,
            expected_size,
            true,
        )
        .await
        .map_err(|retry_error| {
            format!(
                "Failed to push app-info dex; retry also failed. First error: {}; retry error: {}",
                truncate_detail(&first_error, MAX_ERROR_DETAIL_BYTES / 2),
                truncate_detail(&retry_error, MAX_ERROR_DETAIL_BYTES / 2)
            )
        })?,
    };

    let first_output = run_helper_once(app, serial, &remote_path, mode, packages).await?;
    let output = if first_output.status.success() {
        first_output
    } else if pushed {
        return Err(helper_exit_error(mode, &first_output));
    } else {
        ensure_dex_pushed(
            app,
            serial,
            &dex_path,
            &remote_path,
            expected_size,
            true,
        )
        .await
        .map_err(|error| {
            format!(
                "{} failed and refreshing app-info.dex also failed: {}",
                mode.description(),
                truncate_detail(&error, MAX_ERROR_DETAIL_BYTES)
            )
        })?;

        let retry_output = run_helper_once(app, serial, &remote_path, mode, packages).await?;
        if !retry_output.status.success() {
            return Err(helper_exit_error(mode, &retry_output));
        }
        retry_output
    };

    parse_helper_output(&output.stdout)
}

async fn ensure_dex_pushed(
    app: &AppHandle,
    serial: &str,
    local_path: &Path,
    remote_path: &str,
    expected_size: u64,
    force: bool,
) -> Result<bool, String> {
    if !force {
        let probe_args = ["-s", serial, "shell", "ls", "-l", remote_path];
        if let Ok(output) = run_adb_output(app, &probe_args, PUSH_TIMEOUT, "inspect remote dex").await
        {
            if output.status.success()
                && parse_ls_size_matches(&String::from_utf8_lossy(&output.stdout), expected_size)
            {
                return Ok(false);
            }
        }
    }

    let local_path = local_path.to_string_lossy().into_owned();
    let push_args = ["-s", serial, "push", local_path.as_str(), remote_path];
    let output = run_adb_output(app, &push_args, PUSH_TIMEOUT, "push app-info dex").await?;
    if !output.status.success() {
        return Err(format!(
            "adb push failed: {}",
            truncate_detail(&adb_output_error(&output), MAX_ERROR_DETAIL_BYTES)
        ));
    }
    Ok(true)
}

async fn run_helper_once(
    app: &AppHandle,
    serial: &str,
    remote_path: &str,
    mode: HelperMode,
    packages: &[String],
) -> Result<Output, String> {
    let adb_path = adb::resolve_adb_path(app)?;
    let mut command = adb::prepare_async_command(app, &adb_path);
    command
        .arg("-s")
        .arg(serial)
        .arg("exec-out")
        .arg("sh")
        .arg("-c")
        .arg(build_helper_command(remote_path, mode, packages))
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);

    let child = command
        .spawn()
        .map_err(|error| format!("Failed to start {}: {error}", mode.description()))?;
    match tokio::time::timeout(mode.timeout(), child.wait_with_output()).await {
        Ok(Ok(output)) => Ok(output),
        Ok(Err(error)) => Err(format!("Failed to wait for {}: {error}", mode.description())),
        Err(_) => {
            FORCE_PUSH_NEXT.store(true, Ordering::Release);
            Err(format!(
                "{} timed out after {} seconds; retry to refresh the helper dex.",
                mode.description(),
                mode.timeout().as_secs()
            ))
        }
    }
}

async fn run_adb_output(
    app: &AppHandle,
    args: &[&str],
    timeout: Duration,
    operation: &str,
) -> Result<Output, String> {
    let adb_path = adb::resolve_adb_path(app)?;
    let mut command = adb::prepare_async_command(app, &adb_path);
    command
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    let child = command
        .spawn()
        .map_err(|error| format!("Failed to {operation}: {error}"))?;
    tokio::time::timeout(timeout, child.wait_with_output())
        .await
        .map_err(|_| {
            format!(
                "Timed out after {} seconds while trying to {operation}.",
                timeout.as_secs()
            )
        })?
        .map_err(|error| format!("Failed to {operation}: {error}"))
}

fn helper_exit_error(mode: HelperMode, output: &Output) -> String {
    format!(
        "{} failed even though the dex was freshly pushed; this device ROM may be incompatible: {}",
        mode.description(),
        truncate_detail(&adb_output_error(output), MAX_ERROR_DETAIL_BYTES)
    )
}

fn resolve_app_info_dex_path(app: &AppHandle) -> Result<PathBuf, String> {
    let path = app
        .path()
        .resource_dir()
        .map_err(|error| format!("Failed to locate application resources: {error}"))?
        .join("app-info.dex");
    if !path.is_file() {
        return Err(format!(
            "Bundled app-info.dex was not found at {}. Run scripts/build-app-info-dex/build.sh before packaging.",
            path.display()
        ));
    }
    Ok(path)
}

fn fnv1a_64(bytes: &[u8]) -> u64 {
    bytes.iter().fold(0xcbf29ce484222325_u64, |hash, byte| {
        (hash ^ u64::from(*byte)).wrapping_mul(0x100000001b3)
    })
}

fn remote_dex_path(hash: u64) -> String {
    format!("{REMOTE_DEX_DIR}/{REMOTE_DEX_PREFIX}{hash:016x}.dex")
}

fn build_helper_command(remote_path: &str, mode: HelperMode, packages: &[String]) -> String {
    let mut command = format!(
        "CLASSPATH={remote_path} app_process /data/local/tmp com.adbgui.appinfo.Main {}",
        mode.argument()
    );
    for package in packages {
        command.push(' ');
        command.push_str(package);
    }
    command
}

fn parse_helper_output<T: DeserializeOwned>(stdout: &[u8]) -> Result<Vec<T>, String> {
    let payload = extract_payload(stdout);
    if payload.is_empty() {
        return Err("App-info helper returned empty stdout.".to_string());
    }
    serde_json::from_slice(payload).map_err(|error| {
        format!(
            "App-info helper returned invalid JSON: {error}; stdout: {}",
            truncate_detail(&String::from_utf8_lossy(payload), MAX_ERROR_DETAIL_BYTES)
        )
    })
}

#[cfg(test)]
fn parse_app_info(stdout: &[u8]) -> Result<Vec<AppInfo>, String> {
    parse_helper_output(stdout)
}

fn extract_payload(stdout: &[u8]) -> &[u8] {
    let sentinel = PAYLOAD_SENTINEL.as_bytes();
    let start = stdout
        .windows(sentinel.len())
        .rposition(|window| window == sentinel)
        .map_or(0, |position| position + sentinel.len());
    trim_ascii_whitespace(&stdout[start..])
}

fn trim_ascii_whitespace(mut bytes: &[u8]) -> &[u8] {
    while bytes
        .first()
        .is_some_and(|byte| byte.is_ascii_whitespace())
    {
        bytes = &bytes[1..];
    }
    while bytes
        .last()
        .is_some_and(|byte| byte.is_ascii_whitespace())
    {
        bytes = &bytes[..bytes.len() - 1];
    }
    bytes
}

fn parse_ls_size_matches(output: &str, expected_size: u64) -> bool {
    output
        .split_ascii_whitespace()
        .filter_map(|field| field.parse::<u64>().ok())
        .any(|size| size == expected_size)
}

fn truncate_detail(detail: &str, max_bytes: usize) -> String {
    if detail.len() <= max_bytes {
        return detail.to_string();
    }

    const SUFFIX: &str = "…(truncated)";
    if max_bytes <= SUFFIX.len() {
        let mut end = max_bytes;
        while !detail.is_char_boundary(end) {
            end -= 1;
        }
        return detail[..end].to_string();
    }

    let mut end = max_bytes - SUFFIX.len();
    while !detail.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}{}", &detail[..end], SUFFIX)
}

fn is_safe_package_name(package: &str) -> bool {
    !package.is_empty()
        && !package.starts_with('.')
        && !package.ends_with('.')
        && package
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'.'))
}

fn sanitize_package_filter(packages: &[String]) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut sanitized = Vec::new();
    for package in packages {
        if is_safe_package_name(package) && seen.insert(package.clone()) {
            sanitized.push(package.clone());
        }
    }
    sanitized
}

fn prepare_icon_batches(packages: Option<Vec<String>>) -> Result<Vec<Vec<String>>, String> {
    match packages {
        None => Ok(vec![Vec::new()]),
        Some(packages) if packages.is_empty() => Ok(vec![Vec::new()]),
        Some(packages) => {
            let sanitized = sanitize_package_filter(&packages);
            if sanitized.is_empty() {
                return Err("No valid package names were supplied for icon lookup.".to_string());
            }
            Ok(sanitized
                .chunks(ICON_FILTER_BATCH)
                .map(|batch| batch.to_vec())
                .collect())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_app_info_contract() {
        let apps = parse_app_info(
            br#"[{
                "packageName":"com.example.app",
                "appName":"Example",
                "versionName":"1.2.3",
                "versionCode":45,
                "icon":"data:image/png;base64,AAAA",
                "firstInstallTime":1690000000000,
                "lastUpdateTime":1700000000000,
                "apkSize":12345678
            }]"#,
        )
        .expect("sample app-info JSON should parse");

        assert_eq!(apps.len(), 1);
        assert_eq!(apps[0].package_name, "com.example.app");
        assert_eq!(apps[0].app_name, "Example");
        assert_eq!(apps[0].version_code, 45);
        assert_eq!(apps[0].apk_size, 12_345_678);
    }

    #[test]
    fn rejects_empty_or_invalid_stdout() {
        assert!(parse_app_info(b"").is_err());
        assert!(parse_app_info(b"--ADBGUI-APPINFO-V1--\n").is_err());
        assert!(parse_app_info(b"not-json").is_err());
        assert!(parse_app_info(br#"{"packageName":"com.example.app"}"#).is_err());
    }

    #[test]
    fn extracts_payload_after_last_sentinel_and_trims_ascii_whitespace() {
        let output = b"runtime noise\n--ADBGUI-APPINFO-V1--\nold\n--ADBGUI-APPINFO-V1--\r\n [{\"packageName\":\"a.b\",\"icon\":\"\"}] \t";
        assert_eq!(
            extract_payload(output),
            br#"[{"packageName":"a.b","icon":""}]"#
        );
    }

    #[test]
    fn accepts_legacy_output_without_sentinel() {
        assert_eq!(extract_payload(b" \n[]\r\n"), b"[]");
    }

    #[test]
    fn content_hash_produces_stable_remote_path() {
        assert_eq!(fnv1a_64(b""), 0xcbf29ce484222325);
        assert_ne!(fnv1a_64(b"hello"), fnv1a_64(b"world"));
        assert_eq!(
            remote_dex_path(fnv1a_64(b"hello")),
            "/data/local/tmp/adb-gui-app-info-a430d84680aabd0b.dex"
        );
    }

    #[test]
    fn recognizes_expected_size_in_ls_output() {
        assert!(parse_ls_size_matches(
            "-rw-r--r-- 1 shell shell 12345 2026-09-03 file.dex\n",
            12_345
        ));
        assert!(!parse_ls_size_matches("permission denied", 12_345));
        assert!(!parse_ls_size_matches("", 12_345));
        assert!(!parse_ls_size_matches("-rw-r--r-- shell shell 12 file.dex", 12_345));
    }

    #[test]
    fn package_filter_is_validated_and_deduplicated_in_order() {
        let packages = vec![
            "com.example.one".to_string(),
            "bad-name".to_string(),
            "com.example.one".to_string(),
            "org_example.two".to_string(),
            ".bad".to_string(),
        ];
        assert_eq!(
            sanitize_package_filter(&packages),
            vec!["com.example.one", "org_example.two"]
        );
        assert!(!is_safe_package_name("com.example;rm"));
        assert!(!is_safe_package_name("com.example app"));
        assert!(!is_safe_package_name("com.example.$app"));
        assert!(!is_safe_package_name("com.example."));
    }

    #[test]
    fn rejects_nonempty_filter_when_every_package_is_invalid() {
        assert!(prepare_icon_batches(Some(vec![
            "bad-name".to_string(),
            "also/bad".to_string()
        ]))
        .is_err());
    }

    #[test]
    fn defensively_chunks_large_icon_requests() {
        let exact = (0..50)
            .map(|index| format!("com.example.p{index}"))
            .collect();
        let exact_batches = prepare_icon_batches(Some(exact)).expect("packages should be valid");
        assert_eq!(exact_batches.iter().map(Vec::len).collect::<Vec<_>>(), vec![50]);

        let packages = (0..51)
            .map(|index| format!("com.example.p{index}"))
            .collect();
        let batches = prepare_icon_batches(Some(packages)).expect("packages should be valid");
        assert_eq!(batches.iter().map(Vec::len).collect::<Vec<_>>(), vec![50, 1]);
    }

    #[test]
    fn empty_icon_filter_means_one_unfiltered_call() {
        assert_eq!(prepare_icon_batches(None).unwrap(), vec![Vec::<String>::new()]);
        assert_eq!(
            prepare_icon_batches(Some(Vec::new())).unwrap(),
            vec![Vec::<String>::new()]
        );
    }

    #[test]
    fn builds_filtered_and_unfiltered_helper_commands() {
        let remote = "/data/local/tmp/adb-gui-app-info-0000000000000001.dex";
        assert_eq!(
            build_helper_command(remote, HelperMode::Metadata, &[]),
            format!(
                "CLASSPATH={remote} app_process /data/local/tmp com.adbgui.appinfo.Main --no-icons"
            )
        );
        assert_eq!(
            build_helper_command(
                remote,
                HelperMode::Icons,
                &["com.example.one".to_string(), "com.example.two".to_string()]
            ),
            format!(
                "CLASSPATH={remote} app_process /data/local/tmp com.adbgui.appinfo.Main --icons-only com.example.one com.example.two"
            )
        );
    }

    #[test]
    fn icon_contract_ignores_extra_fields_from_legacy_dex() {
        let entries = parse_helper_output::<AppIconEntry>(
            br#"[{"packageName":"com.example.app","icon":"data:image/png;base64,AAAA","appName":"Example","versionCode":1}]"#,
        )
        .expect("legacy full objects should parse as icon entries");
        assert_eq!(entries[0].package_name, "com.example.app");
    }

    #[test]
    fn truncation_preserves_utf8_boundaries_and_limit() {
        let truncated = truncate_detail("错误🙂detail that keeps going", 18);
        assert!(truncated.is_char_boundary(truncated.len()));
        assert!(truncated.len() <= 18);
        assert_eq!(truncate_detail("错误🙂", 5), "错");
    }
}
