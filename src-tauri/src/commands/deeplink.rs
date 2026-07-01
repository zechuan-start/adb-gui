use tauri::AppHandle;

use super::device::run_adb_with_serial;

#[tauri::command]
pub fn open_deep_link(app: AppHandle, serial: String, url: String) -> Result<String, String> {
    run_adb_with_serial(
        &app,
        &serial,
        &[
            "shell",
            "am",
            "start",
            "-a",
            "android.intent.action.VIEW",
            "-d",
            &url,
        ],
    )
}
