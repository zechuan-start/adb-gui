
use tauri::AppHandle;

use super::device::run_adb_with_serial;

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
