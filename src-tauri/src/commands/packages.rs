use tauri::AppHandle;

use super::device::run_adb_with_serial;

#[tauri::command]
pub fn list_packages(app: AppHandle, serial: String) -> Result<Vec<String>, String> {
    let output = run_adb_with_serial(&app, &serial, &["shell", "pm", "list", "packages", "-3"])?;
    let packages: Vec<String> = output
        .lines()
        .filter_map(|line| line.strip_prefix("package:"))
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    Ok(packages)
}
