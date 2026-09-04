use serde::Serialize;
use tauri::AppHandle;

use super::device::{getprop, run_adb_with_serial};

#[derive(Serialize, Clone)]
pub struct DeviceDetail {
    pub model: String,
    pub manufacturer: String,
    pub android_version: String,
    pub sdk_level: String,
    pub abi: String,
    pub resolution: String,
    pub density: String,
    pub battery_level: String,
    pub battery_status: String,
}

#[tauri::command]
pub fn get_device_info(app: AppHandle, serial: String) -> Result<DeviceDetail, String> {
    let model = getprop(&app, &serial, "ro.product.model");
    let manufacturer = getprop(&app, &serial, "ro.product.manufacturer");
    let android_version = getprop(&app, &serial, "ro.build.version.release");
    let sdk_level = getprop(&app, &serial, "ro.build.version.sdk");
    let abi = getprop(&app, &serial, "ro.product.cpu.abi");
    let resolution = get_resolution(&app, &serial);
    let density = get_density(&app, &serial);
    let (battery_level, battery_status) = get_battery(&app, &serial);

    Ok(DeviceDetail {
        model,
        manufacturer,
        android_version,
        sdk_level,
        abi,
        resolution,
        density,
        battery_level,
        battery_status,
    })
}

fn get_resolution(app: &AppHandle, serial: &str) -> String {
    run_adb_with_serial(app, serial, &["shell", "wm", "size"])
        .unwrap_or_default()
        .lines()
        .last()
        .and_then(|l| l.split(':').nth(1))
        .map(|s| s.trim().to_string())
        .unwrap_or_default()
}

fn get_density(app: &AppHandle, serial: &str) -> String {
    run_adb_with_serial(app, serial, &["shell", "wm", "density"])
        .unwrap_or_default()
        .lines()
        .last()
        .and_then(|l| l.split(':').nth(1))
        .map(|s| s.trim().to_string())
        .unwrap_or_default()
}

fn get_battery(app: &AppHandle, serial: &str) -> (String, String) {
    let output =
        run_adb_with_serial(app, serial, &["shell", "dumpsys", "battery"]).unwrap_or_default();

    let battery = parse_battery_output(&output);
    (battery.level, battery.status)
}

#[derive(Debug, Clone, PartialEq)]
pub(crate) struct ParsedBattery {
    pub level: String,
    pub status: String,
    pub temperature_c: Option<f32>,
}

pub(crate) fn parse_battery_output(output: &str) -> ParsedBattery {
    let mut level = String::new();
    let mut status = String::new();
    let mut temperature_c = None;

    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("level:") {
            level = trimmed
                .strip_prefix("level:")
                .unwrap_or("")
                .trim()
                .to_string();
        } else if trimmed.starts_with("status:") {
            let code = trimmed.strip_prefix("status:").unwrap_or("").trim();
            status = match code {
                "2" => "充电中".to_string(),
                "3" => "放电中".to_string(),
                "4" => "未充电".to_string(),
                "5" => "已充满".to_string(),
                _ => code.to_string(),
            };
        } else if trimmed.starts_with("temperature:") {
            temperature_c = trimmed
                .strip_prefix("temperature:")
                .and_then(|value| value.trim().parse::<f32>().ok())
                .map(|value| value / 10.0);
        }
    }

    ParsedBattery {
        level,
        status,
        temperature_c,
    }
}

#[cfg(test)]
mod tests {
    use super::{parse_battery_output, ParsedBattery};

    #[test]
    fn parses_battery_fields_and_maps_status() {
        assert_eq!(
            parse_battery_output("status: 2\nlevel: 87\ntemperature: 321\n"),
            ParsedBattery {
                level: "87".to_string(),
                status: "充电中".to_string(),
                temperature_c: Some(32.1),
            }
        );
    }

    #[test]
    fn preserves_unknown_status_and_ignores_invalid_temperature() {
        assert_eq!(
            parse_battery_output("status: 9\nlevel: 50\ntemperature: unknown\n"),
            ParsedBattery {
                level: "50".to_string(),
                status: "9".to_string(),
                temperature_c: None,
            }
        );
    }
}
