
use std::path::PathBuf;
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

use crate::adb;

#[derive(serde::Serialize, Clone)]
pub struct ScreenshotResult {
    pub path: String,
    pub opened: bool,
    pub revealed: bool,
}

#[tauri::command]
pub fn take_screenshot(app: AppHandle, serial: String) -> Result<ScreenshotResult, String> {
    let adb_path = adb::resolve_adb_path(&app)?;

    let output = std::process::Command::new(&adb_path)
        .arg("-s")
        .arg(&serial)
        .arg("exec-out")
        .arg("screencap")
        .arg("-p")
        .output()
        .map_err(|e| format!("Failed to take screenshot: {e}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    let save_dir = screenshot_dir();
    std::fs::create_dir_all(&save_dir).map_err(|e| format!("Failed to create dir: {e}"))?;

    let timestamp = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();
    let safe_serial = serial.replace(['/', ':', ' '], "_");
    let file_path = save_dir.join(format!("{}-{}.png", safe_serial, timestamp));

    std::fs::write(&file_path, &output.stdout).map_err(|e| format!("Failed to write file: {e}"))?;

    let path_str = file_path.to_string_lossy().to_string();
    let mut opened = false;
    let mut revealed = false;

    if let Err(err) = app.opener().open_path(&path_str, None::<&str>) {
        eprintln!("failed to open screenshot: {err}");
    } else {
        opened = true;
    }

    if let Err(err) = app.opener().reveal_item_in_dir(&path_str) {
        eprintln!("failed to reveal screenshot: {err}");
    } else {
        revealed = true;
    }

    Ok(ScreenshotResult { path: path_str, opened, revealed })
}

fn screenshot_dir() -> PathBuf {
    if let Some(dir) = dirs::picture_dir() {
        dir.join("ADB GUI")
    } else {
        PathBuf::from("/tmp/ADB GUI")
    }
}
