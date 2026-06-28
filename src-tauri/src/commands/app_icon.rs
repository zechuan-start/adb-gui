use base64::Engine;
use tauri::AppHandle;

use crate::adb;

#[tauri::command]
pub fn get_app_icon(app: AppHandle, serial: String, pkg: String) -> Result<String, String> {
    let adb_path = adb::resolve_adb_path(&app)?;

    let output = std::process::Command::new(&adb_path)
        .arg("-s")
        .arg(&serial)
        .arg("exec-out")
        .arg("cmd")
        .arg("package")
        .arg("icon")
        .arg(&pkg)
        .arg("0")
        .output()
        .map_err(|e| format!("Failed to get icon: {e}"))?;

    if !output.status.success() || output.stdout.len() < 8 {
        return Ok(String::new());
    }

    // Verify PNG magic bytes
    if &output.stdout[..4] != b"\x89PNG" {
        return Ok(String::new());
    }

    let b64 = base64::engine::general_purpose::STANDARD.encode(&output.stdout);
    Ok(format!("data:image/png;base64,{b64}"))
}
