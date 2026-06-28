
use serde::Serialize;
use std::process::Command;
use tauri::AppHandle;

use crate::adb;

#[derive(Serialize, Clone)]
pub struct DeviceInfo {
    pub serial: String,
    pub state: String,
    pub model: String,
    pub transport: String,
}

pub fn run_adb(app: &AppHandle, args: &[&str]) -> Result<String, String> {
    let adb_path = adb::resolve_adb_path(app)?;
    let output = Command::new(&adb_path)
        .args(args)
        .output()
        .map_err(|e| format!("Failed to execute adb: {e}"))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        Err(stderr.trim().to_string())
    }
}

pub fn run_adb_with_serial(app: &AppHandle, serial: &str, args: &[&str]) -> Result<String, String> {
    let mut full_args = vec!["-s", serial];
    full_args.extend_from_slice(args);
    run_adb(app, &full_args)
}

#[tauri::command]
pub fn get_adb_info(app: AppHandle) -> Result<serde_json::Value, String> {
    let path = adb::resolve_adb_path(&app)?;
    let version = adb::get_adb_version(&path);
    let source = adb::adb_source(&path, &app);
    Ok(serde_json::json!({
        "path": path,
        "version": version,
        "source": source,
    }))
}

#[tauri::command]
pub fn list_devices(app: AppHandle) -> Result<Vec<DeviceInfo>, String> {
    let output = run_adb(&app, &["devices", "-l"])?;
    let mut devices = Vec::new();
    for line in output.lines().skip(1) {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 2 {
            continue;
        }
        let serial = parts[0].to_string();
        let state = parts[1].to_string();

        let mut model = String::new();
        let mut transport = String::new();
        for part in parts.iter().skip(2) {
            if let Some(v) = part.strip_prefix("model:") {
                model = v.to_string();
            } else if let Some(v) = part.strip_prefix("transport_id:") {
                transport = v.to_string();
            }
        }
        devices.push(DeviceInfo {
            serial,
            state,
            model,
            transport,
        });
    }
    Ok(devices)
}

#[tauri::command]
pub fn get_current_activity(app: AppHandle, serial: String) -> Result<String, String> {
    let output = run_adb_with_serial(&app, &serial, &["shell", "dumpsys", "activity", "activities"])?;
    if let Some(activity) = parse_current_activity(&output) {
        Ok(activity)
    } else {
        Ok(String::new())
    }
}

pub fn parse_current_activity(output: &str) -> Option<String> {
    let re = regex::Regex::new(r"(?:mResumedActivity|ResumedActivity).*?([A-Za-z0-9_$.]+/[A-Za-z0-9_$.]+)").unwrap();
    re.captures(output)
        .and_then(|caps| caps.get(1).map(|m| m.as_str().to_string()))
}
