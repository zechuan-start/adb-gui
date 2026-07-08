use serde::Serialize;
use std::path::PathBuf;
use std::sync::{LazyLock, Mutex};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

use super::device::{parse_current_activity, run_adb_with_serial};
use crate::adb;

static BUGREPORT_BUSY: LazyLock<Mutex<bool>> = LazyLock::new(|| Mutex::new(false));

#[derive(Serialize, Clone)]
pub struct QuickReportResult {
    pub dir: String,
    pub revealed: bool,
}

#[derive(Serialize, Clone)]
pub struct BugreportResult {
    pub path: String,
    pub revealed: bool,
}

struct BugreportBusyGuard;

impl Drop for BugreportBusyGuard {
    fn drop(&mut self) {
        if let Ok(mut busy) = BUGREPORT_BUSY.lock() {
            *busy = false;
        }
    }
}

#[tauri::command]
pub fn collect_quick_bug_report(
    app: AppHandle,
    serial: String,
) -> Result<QuickReportResult, String> {
    let timestamp = timestamp();
    let report_dir = reports_dir().join(format!("{}-{timestamp}", safe_serial(&serial)));
    std::fs::create_dir_all(&report_dir)
        .map_err(|e| format!("Failed to create report dir: {e}"))?;

    let mut warnings = Vec::new();
    write_screenshot(&app, &serial, &report_dir.join("screenshot.png"))?;
    let activity = collect_current_activity(&app, &serial, &mut warnings);
    let device_info = collect_device_info(&app, &serial, &mut warnings);

    let logcat =
        match run_adb_with_serial(&app, &serial, &["logcat", "-d", "-t", "50", "-v", "brief"]) {
            Ok(output) => output,
            Err(err) => {
                warnings.push(format!("logcat: {err}"));
                String::new()
            }
        };
    std::fs::write(report_dir.join("logcat.txt"), logcat)
        .map_err(|e| format!("Failed to write logcat.txt: {e}"))?;

    let info = render_info(&timestamp, &serial, &activity, &device_info, &warnings);
    std::fs::write(report_dir.join("info.txt"), info)
        .map_err(|e| format!("Failed to write info.txt: {e}"))?;

    let dir = report_dir.to_string_lossy().to_string();
    let revealed = reveal_item(&app, &dir, "bug report dir");

    Ok(QuickReportResult { dir, revealed })
}

#[tauri::command]
pub async fn collect_full_bugreport(
    app: AppHandle,
    serial: String,
) -> Result<BugreportResult, String> {
    tauri::async_runtime::spawn_blocking(move || collect_full_bugreport_blocking(app, serial))
        .await
        .map_err(|e| format!("Failed to run bugreport worker: {e}"))?
}

fn collect_full_bugreport_blocking(
    app: AppHandle,
    serial: String,
) -> Result<BugreportResult, String> {
    let _busy = acquire_bugreport_slot()?;
    let save_dir = reports_dir();
    std::fs::create_dir_all(&save_dir).map_err(|e| format!("Failed to create report dir: {e}"))?;

    let file_path = save_dir.join(format!(
        "{}-{}-bugreport.zip",
        safe_serial(&serial),
        timestamp()
    ));
    let path = file_path.to_string_lossy().to_string();

    run_adb_with_serial(&app, &serial, &["bugreport", &path])
        .map_err(|e| format!("Failed to collect bugreport: {e}"))?;

    let size = std::fs::metadata(&file_path)
        .map_err(|e| format!("Failed to read bugreport file: {e}"))?
        .len();
    if size == 0 {
        let _ = std::fs::remove_file(&file_path);
        return Err("Bugreport 文件为空，请重试。".to_string());
    }

    let revealed = reveal_item(&app, &path, "bugreport zip");
    Ok(BugreportResult { path, revealed })
}

fn acquire_bugreport_slot() -> Result<BugreportBusyGuard, String> {
    let mut busy = BUGREPORT_BUSY
        .lock()
        .map_err(|e| format!("Failed to lock bugreport state: {e}"))?;
    if *busy {
        return Err("完整 Bugreport 正在生成，请等待当前任务完成。".to_string());
    }

    *busy = true;
    Ok(BugreportBusyGuard)
}

fn write_screenshot(app: &AppHandle, serial: &str, path: &PathBuf) -> Result<(), String> {
    let adb_path = adb::resolve_adb_path(app)?;
    let output = adb::prepare_command(app, &adb_path)
        .arg("-s")
        .arg(serial)
        .arg("exec-out")
        .arg("screencap")
        .arg("-p")
        .output()
        .map_err(|e| format!("Failed to take screenshot: {e}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    if output.stdout.is_empty() {
        return Err("截图结果为空，请确认设备屏幕可用。".to_string());
    }

    std::fs::write(path, &output.stdout).map_err(|e| format!("Failed to write screenshot.png: {e}"))
}

fn collect_current_activity(app: &AppHandle, serial: &str, warnings: &mut Vec<String>) -> String {
    match run_adb_with_serial(app, serial, &["shell", "dumpsys", "activity", "activities"]) {
        Ok(output) => parse_current_activity(&output).unwrap_or_default(),
        Err(err) => {
            warnings.push(format!("current_activity: {err}"));
            String::new()
        }
    }
}

fn collect_device_info(
    app: &AppHandle,
    serial: &str,
    warnings: &mut Vec<String>,
) -> Vec<(String, String)> {
    let battery = battery_dump(app, serial, warnings);
    vec![
        (
            "model".to_string(),
            getprop(app, serial, "ro.product.model", warnings),
        ),
        (
            "manufacturer".to_string(),
            getprop(app, serial, "ro.product.manufacturer", warnings),
        ),
        (
            "android_version".to_string(),
            getprop(app, serial, "ro.build.version.release", warnings),
        ),
        (
            "sdk_level".to_string(),
            getprop(app, serial, "ro.build.version.sdk", warnings),
        ),
        (
            "abi".to_string(),
            getprop(app, serial, "ro.product.cpu.abi", warnings),
        ),
        (
            "resolution".to_string(),
            get_resolution(app, serial, warnings),
        ),
        ("density".to_string(), get_density(app, serial, warnings)),
        (
            "battery_level".to_string(),
            get_battery_value(&battery, "level"),
        ),
        ("battery_status".to_string(), get_battery_status(&battery)),
    ]
}

fn getprop(app: &AppHandle, serial: &str, prop: &str, warnings: &mut Vec<String>) -> String {
    run_trimmed(app, serial, &["shell", "getprop", prop], prop, warnings)
}

fn get_resolution(app: &AppHandle, serial: &str, warnings: &mut Vec<String>) -> String {
    run_trimmed(app, serial, &["shell", "wm", "size"], "wm size", warnings)
        .lines()
        .last()
        .and_then(|line| line.split(':').nth(1))
        .map(|value| value.trim().to_string())
        .unwrap_or_default()
}

fn get_density(app: &AppHandle, serial: &str, warnings: &mut Vec<String>) -> String {
    run_trimmed(
        app,
        serial,
        &["shell", "wm", "density"],
        "wm density",
        warnings,
    )
    .lines()
    .last()
    .and_then(|line| line.split(':').nth(1))
    .map(|value| value.trim().to_string())
    .unwrap_or_default()
}

fn get_battery_value(output: &str, key: &str) -> String {
    output
        .lines()
        .find_map(|line| {
            let trimmed = line.trim();
            trimmed
                .strip_prefix(&format!("{key}:"))
                .map(|value| value.trim().to_string())
        })
        .unwrap_or_default()
}

fn get_battery_status(output: &str) -> String {
    match get_battery_value(output, "status").as_str() {
        "2" => "充电中".to_string(),
        "3" => "放电中".to_string(),
        "4" => "未充电".to_string(),
        "5" => "已充满".to_string(),
        code => code.to_string(),
    }
}

fn battery_dump(app: &AppHandle, serial: &str, warnings: &mut Vec<String>) -> String {
    run_trimmed(
        app,
        serial,
        &["shell", "dumpsys", "battery"],
        "dumpsys battery",
        warnings,
    )
}

fn run_trimmed(
    app: &AppHandle,
    serial: &str,
    args: &[&str],
    label: &str,
    warnings: &mut Vec<String>,
) -> String {
    match run_adb_with_serial(app, serial, args) {
        Ok(output) => output.trim().to_string(),
        Err(err) => {
            warnings.push(format!("{label}: {err}"));
            String::new()
        }
    }
}

fn render_info(
    collected_at: &str,
    serial: &str,
    activity: &str,
    device_info: &[(String, String)],
    warnings: &[String],
) -> String {
    let mut lines = vec![
        format!("collected_at: {collected_at}"),
        format!("device_serial: {serial}"),
        format!("current_activity: {activity}"),
        String::new(),
        "[device]".to_string(),
    ];

    for (key, value) in device_info {
        lines.push(format!("{key}: {value}"));
    }

    if !warnings.is_empty() {
        lines.push(String::new());
        lines.push("[warnings]".to_string());
        lines.extend(warnings.iter().cloned());
    }

    lines.push(String::new());
    lines.join("\n")
}

fn reports_dir() -> PathBuf {
    if let Some(dir) = dirs::document_dir() {
        dir.join("ADB GUI").join("reports")
    } else {
        PathBuf::from("/tmp/ADB GUI/reports")
    }
}

fn reveal_item(app: &AppHandle, path: &str, label: &str) -> bool {
    if let Err(err) = app.opener().reveal_item_in_dir(path) {
        eprintln!("failed to reveal {label}: {err}");
        false
    } else {
        true
    }
}

fn timestamp() -> String {
    chrono::Local::now().format("%Y%m%d-%H%M%S").to_string()
}

fn safe_serial(serial: &str) -> String {
    serial.replace(['/', ':', ' '], "_")
}

#[cfg(test)]
mod tests {
    use super::{render_info, safe_serial};

    #[test]
    fn safe_serial_replaces_path_separators() {
        assert_eq!(safe_serial("192.168.1.2:5555"), "192.168.1.2_5555");
        assert_eq!(safe_serial("usb/device name"), "usb_device_name");
    }

    #[test]
    fn render_info_includes_device_fields_and_warnings() {
        let info = render_info(
            "20260703-104500",
            "serial",
            "com.example/.MainActivity",
            &[
                ("model".to_string(), "Pixel".to_string()),
                ("battery_level".to_string(), "90".to_string()),
            ],
            &["logcat: denied".to_string()],
        );

        assert!(info.contains("current_activity: com.example/.MainActivity"));
        assert!(info.contains("model: Pixel"));
        assert!(info.contains("[warnings]"));
        assert!(info.contains("logcat: denied"));
    }
}
