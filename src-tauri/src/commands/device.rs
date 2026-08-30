use serde::Serialize;
use std::collections::HashSet;
use std::process::Output;
use tauri::AppHandle;

use crate::adb;

const MDNS_CONNECT_SERVICE_SUFFIXES: [&str; 2] = ["._adb-tls-connect._tcp", "._adb._tcp"];

#[derive(Serialize, Clone)]
pub struct DeviceInfo {
    pub serial: String,
    pub state: String,
    pub model: String,
    pub transport: String,
    pub is_network: bool,
    pub alias_identity: Option<String>,
}

pub fn run_adb_output(app: &AppHandle, args: &[&str]) -> Result<Output, String> {
    let adb_path = adb::resolve_adb_path(app)?;
    adb::prepare_command(app, &adb_path)
        .args(args)
        .output()
        .map_err(|e| format!("Failed to execute adb: {e}"))
}

pub fn run_adb(app: &AppHandle, args: &[&str]) -> Result<String, String> {
    let output = run_adb_output(app, args)?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(adb_output_error(&output))
    }
}

pub fn run_adb_with_serial(app: &AppHandle, serial: &str, args: &[&str]) -> Result<String, String> {
    let mut full_args = vec!["-s", serial];
    full_args.extend_from_slice(args);
    run_adb(app, &full_args)
}

pub fn run_adb_output_with_serial(
    app: &AppHandle,
    serial: &str,
    args: &[&str],
) -> Result<Output, String> {
    let mut full_args = vec!["-s", serial];
    full_args.extend_from_slice(args);
    run_adb_output(app, &full_args)
}

pub fn run_adb_bytes_with_serial(
    app: &AppHandle,
    serial: &str,
    args: &[&str],
) -> Result<Vec<u8>, String> {
    let output = run_adb_output_with_serial(app, serial, args)?;
    if output.status.success() {
        Ok(output.stdout)
    } else {
        Err(adb_output_error(&output))
    }
}

pub(super) fn adb_output_error(output: &Output) -> String {
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if stderr.is_empty() {
        format!("adb exited with status {}", output.status)
    } else {
        stderr
    }
}

#[tauri::command]
pub fn get_adb_info(app: AppHandle) -> Result<serde_json::Value, String> {
    let path = adb::resolve_adb_path(&app)?;
    let version = adb::get_adb_version(&app, &path);
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
    Ok(parse_devices_output(&output))
}

fn parse_devices_output(output: &str) -> Vec<DeviceInfo> {
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
        let alias_identity = mdns_alias_identity(&serial).map(str::to_owned);
        let is_network = serial.contains(':') || alias_identity.is_some();

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
            is_network,
            alias_identity,
        });
    }

    // ADB matches the bare mDNS service serial as a prefix, so its :port alias makes -s ambiguous.
    let mdns_port_aliases: HashSet<String> = devices
        .iter()
        .filter_map(|device| match device.alias_identity.as_deref() {
            Some(identity) if identity != device.serial => Some(identity.to_owned()),
            _ => None,
        })
        .collect();
    devices.retain(|device| !mdns_port_aliases.contains(&device.serial));
    devices
}

fn mdns_alias_identity(serial: &str) -> Option<&str> {
    mdns_port_alias_base(serial).or_else(|| {
        MDNS_CONNECT_SERVICE_SUFFIXES
            .iter()
            .any(|suffix| serial.ends_with(suffix))
            .then_some(serial)
    })
}

fn mdns_port_alias_base(serial: &str) -> Option<&str> {
    let (base, port) = serial.rsplit_once(':')?;
    let port = port.parse::<u16>().ok()?;
    (port != 0
        && MDNS_CONNECT_SERVICE_SUFFIXES
            .iter()
            .any(|suffix| base.ends_with(suffix)))
    .then_some(base)
}

#[tauri::command]
pub fn get_current_activity(app: AppHandle, serial: String) -> Result<String, String> {
    let output = run_adb_with_serial(
        &app,
        &serial,
        &["shell", "dumpsys", "activity", "activities"],
    )?;
    if let Some(activity) = parse_current_activity(&output) {
        Ok(activity)
    } else {
        Ok(String::new())
    }
}

pub fn parse_current_activity(output: &str) -> Option<String> {
    let re = regex::Regex::new(
        r"(?:mResumedActivity|ResumedActivity).*?([A-Za-z0-9_$.]+/[A-Za-z0-9_$.]+)",
    )
    .unwrap();
    re.captures(output)
        .and_then(|caps| caps.get(1).map(|m| m.as_str().to_string()))
}

#[cfg(test)]
mod tests {
    use super::{parse_current_activity, parse_devices_output};

    #[test]
    fn collapses_ambiguous_mdns_service_serial_when_port_alias_exists() {
        let output = "List of devices attached\n\
adb-275179f2-BYZBAE._adb-tls-connect._tcp device product:vermeer model:23113RKC6C device:vermeer transport_id:1\n\
adb-275179f2-BYZBAE._adb-tls-connect._tcp:5555 device product:vermeer model:23113RKC6C device:vermeer transport_id:22\n\
emulator-5554 device product:sdk_gphone16k_arm64 model:sdk_gphone16k_arm64 device:emu64a16k transport_id:303\n";

        let devices = parse_devices_output(output);

        assert_eq!(devices.len(), 2);
        assert_eq!(
            devices
                .iter()
                .map(|device| device.serial.as_str())
                .collect::<Vec<_>>(),
            vec![
                "adb-275179f2-BYZBAE._adb-tls-connect._tcp:5555",
                "emulator-5554"
            ]
        );
        assert!(devices[0].is_network);
        assert_eq!(
            devices[0].alias_identity.as_deref(),
            Some("adb-275179f2-BYZBAE._adb-tls-connect._tcp")
        );
    }

    #[test]
    fn keeps_mdns_service_serial_without_a_port_alias() {
        let output = "List of devices attached\n\
adb-275179f2-BYZBAE._adb-tls-connect._tcp device product:vermeer model:23113RKC6C device:vermeer transport_id:1\n\
emulator-5554 device product:sdk_gphone16k_arm64 model:sdk_gphone16k_arm64 device:emu64a16k transport_id:303\n";

        let devices = parse_devices_output(output);

        assert_eq!(devices.len(), 2);
        assert_eq!(
            devices[0].serial,
            "adb-275179f2-BYZBAE._adb-tls-connect._tcp"
        );
        assert_eq!(devices[0].transport, "1");
        assert!(devices[0].is_network);
        assert_eq!(
            devices[0].alias_identity.as_deref(),
            Some("adb-275179f2-BYZBAE._adb-tls-connect._tcp")
        );
    }

    #[test]
    fn keeps_non_port_suffixes_as_distinct_serials() {
        let output = "List of devices attached\n\
adb-example._adb-tls-connect._tcp device model:Phone transport_id:1\n\
adb-example._adb-tls-connect._tcp:not-a-port device model:Phone transport_id:2\n";

        let devices = parse_devices_output(output);

        assert_eq!(devices.len(), 2);
    }

    #[test]
    fn collapses_legacy_adb_mdns_service_aliases() {
        let output = "List of devices attached\n\
legacy-device._adb._tcp device model:Phone transport_id:1\n\
legacy-device._adb._tcp:5555 device model:Phone transport_id:2\n";

        let devices = parse_devices_output(output);

        assert_eq!(devices.len(), 1);
        assert_eq!(devices[0].serial, "legacy-device._adb._tcp:5555");
        assert!(devices[0].is_network);
        assert_eq!(
            devices[0].alias_identity.as_deref(),
            Some("legacy-device._adb._tcp")
        );
    }

    #[test]
    fn accepts_only_ports_between_one_and_65535() {
        let output = "List of devices attached\n\
zero._adb._tcp device model:Phone transport_id:1\n\
zero._adb._tcp:0 device model:Phone transport_id:2\n\
max._adb._tcp device model:Phone transport_id:3\n\
max._adb._tcp:65535 device model:Phone transport_id:4\n\
overflow._adb._tcp device model:Phone transport_id:5\n\
overflow._adb._tcp:65536 device model:Phone transport_id:6\n";

        let devices = parse_devices_output(output);

        assert_eq!(
            devices
                .iter()
                .map(|device| device.serial.as_str())
                .collect::<Vec<_>>(),
            vec![
                "zero._adb._tcp",
                "zero._adb._tcp:0",
                "max._adb._tcp:65535",
                "overflow._adb._tcp",
                "overflow._adb._tcp:65536",
            ]
        );
    }

    #[test]
    fn preserves_alias_order_when_aliases_precede_and_follow_the_bare_serial() {
        let output = "List of devices attached\n\
ordered._adb-tls-connect._tcp:6000 device model:Phone transport_id:1\n\
emulator-5554 device model:Emulator transport_id:2\n\
ordered._adb-tls-connect._tcp device model:Phone transport_id:3\n\
ordered._adb-tls-connect._tcp:5555 device model:Phone transport_id:4\n";

        let devices = parse_devices_output(output);

        assert_eq!(
            devices
                .iter()
                .map(|device| device.serial.as_str())
                .collect::<Vec<_>>(),
            vec![
                "ordered._adb-tls-connect._tcp:6000",
                "emulator-5554",
                "ordered._adb-tls-connect._tcp:5555",
            ]
        );
    }

    #[test]
    fn checks_the_complete_base_when_instance_contains_a_service_like_suffix() {
        let base = "instance._adb-tls-connect._tcp-shadow._adb._tcp";
        let output = format!(
            "List of devices attached\n{base} device model:Phone transport_id:1\n{base}:5555 device model:Phone transport_id:2\n"
        );

        let devices = parse_devices_output(&output);

        assert_eq!(devices.len(), 1);
        assert_eq!(devices[0].serial, format!("{base}:5555"));
    }

    #[test]
    fn does_not_collapse_pairing_service_aliases() {
        let output = "List of devices attached\n\
pairing-device._adb-tls-pairing._tcp device model:Phone transport_id:1\n\
pairing-device._adb-tls-pairing._tcp:5555 device model:Phone transport_id:2\n";

        let devices = parse_devices_output(output);

        assert_eq!(devices.len(), 2);
    }

    #[test]
    fn drops_an_online_bare_serial_even_when_its_unique_alias_is_offline() {
        let output = "List of devices attached\n\
stateful._adb-tls-connect._tcp device model:Phone transport_id:1\n\
stateful._adb-tls-connect._tcp:5555 offline model:Phone transport_id:2\n";

        let devices = parse_devices_output(output);

        assert_eq!(devices.len(), 1);
        assert_eq!(devices[0].serial, "stateful._adb-tls-connect._tcp:5555");
        assert_eq!(devices[0].state, "offline");
    }

    #[test]
    fn marks_an_isolated_offline_bare_service_as_network_identity() {
        let output = "List of devices attached\n\
offline-device._adb._tcp offline model:Phone transport_id:1\n";

        let devices = parse_devices_output(output);

        assert_eq!(devices.len(), 1);
        assert!(devices[0].is_network);
        assert_eq!(
            devices[0].alias_identity.as_deref(),
            Some("offline-device._adb._tcp")
        );
    }

    #[test]
    fn serializes_network_metadata_for_the_frontend_contract() {
        let output = "List of devices attached\n\
phone._adb-tls-connect._tcp:5555 device model:Phone transport_id:1\n";
        let devices = parse_devices_output(output);

        let payload = serde_json::to_value(&devices[0]).unwrap();

        assert_eq!(payload["is_network"], true);
        assert_eq!(payload["alias_identity"], "phone._adb-tls-connect._tcp");
    }

    #[test]
    fn parse_current_activity_from_resumed_activity_line() {
        let output =
            "ResumedActivity: ActivityRecord{ab08a9f u0 com.miui.home/.launcher.Launcher t2}";

        assert_eq!(
            parse_current_activity(output).as_deref(),
            Some("com.miui.home/.launcher.Launcher")
        );
    }

    #[test]
    fn parse_current_activity_from_legacy_m_resumed_line() {
        let output = "mResumedActivity: ActivityRecord{123 u0 cn.example/.MainActivity t42}";

        assert_eq!(
            parse_current_activity(output).as_deref(),
            Some("cn.example/.MainActivity")
        );
    }
}
