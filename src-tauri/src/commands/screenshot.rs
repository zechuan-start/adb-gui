use crate::{error::AppError, error_codes as codes};
use tauri::{image::Image, AppHandle};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_opener::OpenerExt;

use super::capture_behavior::{after_save, ScreenshotBehavior};
use super::capture_output::{capture_id, capture_target, CaptureDestination, CaptureOutput};
use crate::adb;

#[derive(serde::Serialize, Clone)]
pub struct ScreenshotResult {
    pub path: String,
    pub opened: bool,
    pub revealed: bool,
}

#[tauri::command]
pub async fn take_screenshot(
    app: AppHandle,
    serial: String,
    behavior: ScreenshotBehavior,
    destination: CaptureDestination,
) -> Result<ScreenshotResult, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        save_screenshot(app, serial, behavior, destination)
    })
    .await
    .map_err(|error| AppError::new(codes::SCREENSHOT_WORKER_FAILED).detail(error.to_string()))?
}

fn save_screenshot(
    app: AppHandle,
    serial: String,
    behavior: ScreenshotBehavior,
    destination: CaptureDestination,
) -> Result<ScreenshotResult, AppError> {
    let file_path = capture_target(&destination, &serial, &capture_id()?, "png")?;
    let mut output = CaptureOutput::new(&file_path)?;
    let png = capture_screenshot(&app, &serial)?;
    Image::from_bytes(&png)
        .map_err(|error| AppError::new(codes::SCREENSHOT_INVALID_PNG).detail(error.to_string()))?;
    output.write(&png)?;
    output.verify_size(png.len() as u64)?;
    output.publish(false)?;

    let path_str = file_path.to_string_lossy().to_string();
    let opened = after_save(behavior.open_after_save, || {
        app.opener().open_path(&path_str, None::<&str>)
    });
    let revealed = after_save(behavior.reveal_after_save, || {
        app.opener().reveal_item_in_dir(&path_str)
    });

    Ok(ScreenshotResult {
        path: path_str,
        opened,
        revealed,
    })
}

#[tauri::command]
pub fn copy_screenshot(app: AppHandle, serial: String) -> Result<(), AppError> {
    let png = capture_screenshot(&app, &serial)?;
    let image = Image::from_bytes(&png)
        .map_err(|e| AppError::new(codes::SCREENSHOT_DECODE_FAILED).detail(e.to_string()))?;

    app.clipboard()
        .write_image(&image)
        .map_err(|e| AppError::new(codes::SCREENSHOT_COPY_FAILED).detail(e.to_string()))
}

fn capture_screenshot(app: &AppHandle, serial: &str) -> Result<Vec<u8>, AppError> {
    let adb_path = adb::resolve_adb_path(app)?;

    let output = adb::prepare_command(app, &adb_path)
        .arg("-s")
        .arg(serial)
        .arg("exec-out")
        .arg("screencap")
        .arg("-p")
        .output()
        .map_err(|e| AppError::new(codes::SCREENSHOT_CAPTURE_FAILED).detail(e.to_string()))?;

    if !output.status.success() {
        return Err(super::device::adb_output_error(&output));
    }

    Ok(output.stdout)
}
