use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Stdio;
use std::time::Duration;
use tauri::{AppHandle, Manager};

use crate::adb;

use super::device::{adb_output_error, run_adb_with_serial};

const REMOTE_DEX_PATH: &str = "/data/local/tmp/adb-gui-app-info.dex";
const APP_PROCESS_COMMAND: &str =
    "CLASSPATH=/data/local/tmp/adb-gui-app-info.dex app_process /data/local/tmp com.adbgui.appinfo.Main";
const APP_PROCESS_TIMEOUT: Duration = Duration::from_secs(15);

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

#[tauri::command]
pub async fn get_installed_apps(
    app: AppHandle,
    serial: String,
) -> Result<Vec<AppInfo>, String> {
    let dex_path = resolve_app_info_dex_path(&app)?;
    let local_path = dex_path.to_string_lossy().into_owned();
    let push_app = app.clone();
    let push_serial = serial.clone();

    tauri::async_runtime::spawn_blocking(move || {
        run_adb_with_serial(
            &push_app,
            &push_serial,
            &["push", &local_path, REMOTE_DEX_PATH],
        )
    })
    .await
    .map_err(|error| format!("Failed to join app-info dex push task: {error}"))?
    .map_err(|error| format!("Failed to push app-info dex: {error}"))?;

    let adb_path = adb::resolve_adb_path(&app)?;
    let mut command = adb::prepare_async_command(&app, &adb_path);
    command
        .arg("-s")
        .arg(&serial)
        .arg("exec-out")
        .arg("sh")
        .arg("-c")
        .arg(APP_PROCESS_COMMAND)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);

    let child = command
        .spawn()
        .map_err(|error| format!("Failed to start app-info helper: {error}"))?;
    let output = tokio::time::timeout(APP_PROCESS_TIMEOUT, child.wait_with_output())
        .await
        .map_err(|_| "App-info helper timed out after 15 seconds.".to_string())?
        .map_err(|error| format!("Failed to wait for app-info helper: {error}"))?;

    if !output.status.success() {
        return Err(format!(
            "App-info helper failed: {}",
            adb_output_error(&output)
        ));
    }

    parse_app_info(&output.stdout)
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

fn parse_app_info(stdout: &[u8]) -> Result<Vec<AppInfo>, String> {
    if stdout.is_empty() {
        return Err("App-info helper returned empty stdout.".to_string());
    }
    serde_json::from_slice(stdout)
        .map_err(|error| format!("App-info helper returned invalid JSON: {error}"))
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
        assert!(parse_app_info(b"not-json").is_err());
        assert!(parse_app_info(br#"{"packageName":"com.example.app"}"#).is_err());
    }
}
