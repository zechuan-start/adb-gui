use std::path::Path;

use tauri::AppHandle;

use super::device::run_adb_with_serial;

const DEVICE_DOWNLOAD_DIR: &str = "/sdcard/Download";

#[tauri::command]
pub fn install_apk(app: AppHandle, serial: String, apk_path: String) -> Result<String, String> {
    let output = run_adb_with_serial(&app, &serial, &["install", "-r", "-t", &apk_path])?;
    if output.contains("Success") {
        Ok("Success".to_string())
    } else {
        Ok(output.trim().to_string())
    }
}

#[tauri::command]
pub async fn push_apk(app: AppHandle, serial: String, apk_path: String) -> Result<String, String> {
    let remote_path = apk_remote_path(&apk_path)?;

    tauri::async_runtime::spawn_blocking(move || {
        run_adb_with_serial(
            &app,
            &serial,
            &["shell", "mkdir", "-p", DEVICE_DOWNLOAD_DIR],
        )
        .map_err(|error| format!("创建设备下载目录失败: {error}"))?;
        run_adb_with_serial(&app, &serial, &["push", &apk_path, &remote_path])?;
        Ok(remote_path)
    })
    .await
    .map_err(|error| format!("推送任务执行失败: {error}"))?
}

#[tauri::command]
pub fn uninstall_app(app: AppHandle, serial: String, pkg: String) -> Result<String, String> {
    run_adb_with_serial(&app, &serial, &["uninstall", &pkg])
}

#[tauri::command]
pub fn launch_app(app: AppHandle, serial: String, pkg: String) -> Result<String, String> {
    let component = resolve_launch_component(&app, &serial, &pkg)?;
    run_adb_with_serial(
        &app,
        &serial,
        &["shell", "am", "start", "-W", "-n", &component],
    )
}

#[tauri::command]
pub fn force_stop_app(app: AppHandle, serial: String, pkg: String) -> Result<String, String> {
    run_adb_with_serial(&app, &serial, &["shell", "am", "force-stop", &pkg])
}

#[tauri::command]
pub fn clear_app_data(app: AppHandle, serial: String, pkg: String) -> Result<String, String> {
    run_adb_with_serial(&app, &serial, &["shell", "pm", "clear", &pkg])
}

fn resolve_launch_component(app: &AppHandle, serial: &str, pkg: &str) -> Result<String, String> {
    let candidates = [
        &[
            "shell",
            "cmd",
            "package",
            "resolve-activity",
            "--brief",
            "--components",
            "--user",
            "0",
            "-a",
            "android.intent.action.MAIN",
            "-c",
            "android.intent.category.LAUNCHER",
            pkg,
        ][..],
        &[
            "shell",
            "cmd",
            "package",
            "query-activities",
            "--brief",
            "--components",
            "--user",
            "0",
            "-a",
            "android.intent.action.MAIN",
            "-c",
            "android.intent.category.LAUNCHER",
            pkg,
        ][..],
    ];

    for args in candidates {
        if let Ok(output) = run_adb_with_serial(app, serial, args) {
            if let Some(component) = parse_component(&output) {
                return Ok(component);
            }
        }
    }

    Err(format!("无法找到 {pkg} 的启动 Activity"))
}

fn parse_component(output: &str) -> Option<String> {
    output
        .lines()
        .map(str::trim)
        .filter(|line| {
            !line.is_empty()
                && !line.eq_ignore_ascii_case("No activity found")
                && !line.eq_ignore_ascii_case("No activities found")
                && !line.starts_with("priority=")
                && !line.starts_with("match=")
        })
        .find(|line| line.contains('/'))
        .map(ToString::to_string)
}

fn apk_remote_path(apk_path: &str) -> Result<String, String> {
    let path = Path::new(apk_path);
    let is_apk = path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("apk"));
    if !is_apk {
        return Err("仅支持 APK 文件".to_string());
    }

    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .ok_or_else(|| "无法读取 APK 文件名".to_string())?;

    Ok(format!("{DEVICE_DOWNLOAD_DIR}/{file_name}"))
}

#[cfg(test)]
mod tests {
    use super::apk_remote_path;

    #[test]
    fn builds_download_path_from_apk_file_name() {
        assert_eq!(
            apk_remote_path("release build.APK").as_deref(),
            Ok("/sdcard/Download/release build.APK")
        );
    }

    #[test]
    fn rejects_non_apk_files() {
        assert_eq!(
            apk_remote_path("release.zip"),
            Err("仅支持 APK 文件".to_string())
        );
    }
}
