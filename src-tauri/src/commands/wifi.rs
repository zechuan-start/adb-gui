use std::time::Duration;

use tauri::AppHandle;

use super::device::{run_adb, run_adb_with_serial};

#[tauri::command]
pub fn adb_connect(app: AppHandle, address: String) -> Result<String, String> {
    let addr = normalize_address(&address)?;
    run_adb_connect(&app, &addr)
}

#[tauri::command]
pub fn adb_disconnect(app: AppHandle, address: String) -> Result<String, String> {
    let addr = normalize_address(&address)?;
    run_adb(&app, &["disconnect", &addr]).map(|output| output.trim().to_string())
}

#[tauri::command]
pub fn enable_wifi_debugging(app: AppHandle, serial: String) -> Result<String, String> {
    let ip = get_device_wifi_ip(&app, &serial)?;
    run_adb_with_serial(&app, &serial, &["tcpip", "5555"])
        .map_err(|e| format!("Failed to enable tcpip mode: {e}"))?;
    std::thread::sleep(Duration::from_millis(1500));

    let addr = format!("{ip}:5555");
    run_adb_connect(&app, &addr)?;
    Ok(addr)
}

fn run_adb_connect(app: &AppHandle, addr: &str) -> Result<String, String> {
    let output = run_adb(app, &["connect", addr])?;
    let trimmed = output.trim();
    let lower = trimmed.to_lowercase();
    if lower.contains("failed") || lower.contains("unable") || lower.contains("cannot") {
        Err(trimmed.to_string())
    } else {
        Ok(trimmed.to_string())
    }
}

fn get_device_wifi_ip(app: &AppHandle, serial: &str) -> Result<String, String> {
    let output = run_adb_with_serial(
        app,
        serial,
        &["shell", "ip", "-f", "inet", "addr", "show", "wlan0"],
    )
    .map_err(|e| format!("Failed to read WiFi IP: {e}"))?;
    parse_inet_addr(&output).ok_or_else(|| "未检测到 WiFi IP, 请确认设备已连接 WiFi".to_string())
}

fn parse_inet_addr(output: &str) -> Option<String> {
    let re = regex::Regex::new(r"inet\s+(\d+\.\d+\.\d+\.\d+)/").ok()?;
    re.captures(output)
        .and_then(|captures| captures.get(1).map(|m| m.as_str().to_string()))
}

fn normalize_address(address: &str) -> Result<String, String> {
    let trimmed = address.trim();
    if trimmed.is_empty() {
        return Err("请输入设备 IP 或 ip:port".to_string());
    }
    if trimmed.contains(':') {
        Ok(trimmed.to_string())
    } else {
        Ok(format!("{trimmed}:5555"))
    }
}
