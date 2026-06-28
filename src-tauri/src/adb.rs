use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

pub struct AppState {
    pub adb_path: Mutex<String>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            adb_path: Mutex::new(String::new()),
        }
    }
}

pub fn resolve_adb_path(app: &AppHandle) -> Result<String, String> {
    let state = app.state::<AppState>();
    {
        let cached = state.adb_path.lock().unwrap();
        if !cached.is_empty() {
            return Ok(cached.clone());
        }
    }

    let path = find_adb(app)?;
    let mut cached = state.adb_path.lock().unwrap();
    *cached = path.clone();
    Ok(path)
}

fn find_adb(app: &AppHandle) -> Result<String, String> {
    if let Ok(p) = which_adb() {
        return Ok(p);
    }

    if let Ok(home) = std::env::var("ANDROID_HOME") {
        let candidate = if cfg!(target_os = "windows") {
            PathBuf::from(home).join("platform-tools").join("adb.exe")
        } else {
            PathBuf::from(home).join("platform-tools").join("adb")
        };
        if candidate.exists() {
            return Ok(candidate.to_string_lossy().to_string());
        }
    }

    if let Ok(sdk) = std::env::var("ANDROID_SDK_ROOT") {
        let candidate = if cfg!(target_os = "windows") {
            PathBuf::from(sdk).join("platform-tools").join("adb.exe")
        } else {
            PathBuf::from(sdk).join("platform-tools").join("adb")
        };
        if candidate.exists() {
            return Ok(candidate.to_string_lossy().to_string());
        }
    }

    let resource_dir = app.path().resource_dir().map_err(|e| e.to_string())?;
    let platform_dir = if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "windows") {
        "windows"
    } else {
        "linux"
    };
    let adb_name = if cfg!(target_os = "windows") { "adb.exe" } else { "adb" };
    let embedded = resource_dir.join(platform_dir).join(adb_name);
    if embedded.exists() {
        if cfg!(target_family = "unix") {
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let perms = std::fs::metadata(&embedded).map_err(|e| e.to_string())?;
                let mut perms = perms.permissions();
                perms.set_mode(0o755);
                std::fs::set_permissions(&embedded, perms).map_err(|e| e.to_string())?;
            }
        }
        return Ok(embedded.to_string_lossy().to_string());
    }

    Err("adb not found. Install Android Platform Tools or set ANDROID_HOME.".into())
}

#[cfg(unix)]
fn which_adb() -> Result<String, String> {
    let output = std::process::Command::new("which")
        .arg("adb")
        .output()
        .map_err(|e| format!("which failed: {e}"))?;
    if output.status.success() {
        let p = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !p.is_empty() {
            return Ok(p);
        }
    }
    Err("adb not in PATH".into())
}

#[cfg(windows)]
fn which_adb() -> Result<String, String> {
    let output = std::process::Command::new("where")
        .arg("adb")
        .output()
        .map_err(|e| format!("where failed: {e}"))?;
    if output.status.success() {
        let p = String::from_utf8_lossy(&output.stdout).lines().next().unwrap_or("").trim().to_string();
        if !p.is_empty() {
            return Ok(p);
        }
    }
    Err("adb not in PATH".into())
}

pub fn get_adb_version(adb_path: &str) -> String {
    let output = std::process::Command::new(adb_path)
        .arg("version")
        .output();
    match output {
        Ok(o) => {
            let text = String::from_utf8_lossy(&o.stdout);
            text.lines()
                .find(|l| l.contains("Version"))
                .and_then(|l| l.split_whitespace().nth(1))
                .map(|s| s.to_string())
                .unwrap_or_else(|| "unknown".to_string())
        }
        Err(_) => "unknown".to_string(),
    }
}

pub fn adb_source(adb_path: &str, app: &AppHandle) -> String {
    let resource_dir = app.path().resource_dir().map(|d| d.to_string_lossy().to_string()).unwrap_or_default();
    if adb_path.starts_with(&resource_dir) {
        "embedded".to_string()
    } else if std::env::var("ANDROID_HOME").map(|h| adb_path.contains(&h)).unwrap_or(false)
        || std::env::var("ANDROID_SDK_ROOT").map(|h| adb_path.contains(&h)).unwrap_or(false)
    {
        "sdk".to_string()
    } else {
        "system".to_string()
    }
}
