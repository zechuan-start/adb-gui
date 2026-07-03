use serde::Serialize;
use tauri::AppHandle;

use super::device::run_adb_with_serial;

#[derive(Serialize, Clone)]
pub struct ForwardRule {
    pub direction: String,
    pub local_port: String,
    pub remote_port: String,
    pub raw: String,
}

#[tauri::command]
pub fn list_port_forwards(app: AppHandle, serial: String) -> Result<Vec<ForwardRule>, String> {
    let mut rules = Vec::new();

    let forward_output = run_adb_with_serial(&app, &serial, &["forward", "--list"])?;
    rules.extend(parse_forward_list(&forward_output, &serial, "forward"));

    let reverse_output = run_adb_with_serial(&app, &serial, &["reverse", "--list"])?;
    rules.extend(parse_forward_list(&reverse_output, &serial, "reverse"));

    Ok(rules)
}

#[tauri::command]
pub fn add_port_forward(
    app: AppHandle,
    serial: String,
    direction: String,
    local_port: String,
    remote_port: String,
) -> Result<String, String> {
    let local_port = normalize_port(&local_port)?;
    let remote_port = normalize_port(&remote_port)?;
    let local_endpoint = format!("tcp:{local_port}");
    let remote_endpoint = format!("tcp:{remote_port}");

    let args = match direction.as_str() {
        "forward" => vec!["forward", local_endpoint.as_str(), remote_endpoint.as_str()],
        "reverse" => vec!["reverse", remote_endpoint.as_str(), local_endpoint.as_str()],
        _ => return Err("Invalid direction. Expected forward or reverse.".to_string()),
    };

    run_adb_with_serial(&app, &serial, &args).map(|output| output.trim().to_string())
}

#[tauri::command]
pub fn remove_port_forward(
    app: AppHandle,
    serial: String,
    direction: String,
    port: String,
) -> Result<String, String> {
    let port = normalize_port(&port)?;
    let endpoint = format!("tcp:{port}");

    let args = match direction.as_str() {
        "forward" => vec!["forward", "--remove", endpoint.as_str()],
        "reverse" => vec!["reverse", "--remove", endpoint.as_str()],
        _ => return Err("Invalid direction. Expected forward or reverse.".to_string()),
    };

    run_adb_with_serial(&app, &serial, &args).map(|output| output.trim().to_string())
}

fn parse_forward_list(output: &str, _serial: &str, direction: &str) -> Vec<ForwardRule> {
    output
        .lines()
        .filter_map(|line| parse_forward_line(line, direction))
        .collect()
}

fn parse_forward_line(line: &str, direction: &str) -> Option<ForwardRule> {
    let raw = line.trim();
    if raw.is_empty() {
        return None;
    }

    let parts: Vec<&str> = raw.split_whitespace().collect();
    if parts.len() < 2 {
        return None;
    }

    let tcp_parts: Vec<&str> = parts
        .iter()
        .copied()
        .filter(|part| part.starts_with("tcp:"))
        .collect();
    if tcp_parts.len() < 2 {
        return None;
    }

    let first_port = tcp_parts[0].strip_prefix("tcp:")?.to_string();
    let second_port = tcp_parts[1].strip_prefix("tcp:")?.to_string();

    let (local_port, remote_port) = match direction {
        "forward" => (first_port, second_port),
        "reverse" => (second_port, first_port),
        _ => return None,
    };

    Some(ForwardRule {
        direction: direction.to_string(),
        local_port,
        remote_port,
        raw: raw.to_string(),
    })
}

fn normalize_port(port: &str) -> Result<String, String> {
    let trimmed = port.trim();
    if trimmed.is_empty() || !trimmed.chars().all(|ch| ch.is_ascii_digit()) {
        return Err("Port must be an integer between 1 and 65535.".to_string());
    }

    let value: u16 = trimmed
        .parse()
        .map_err(|_| "Port must be an integer between 1 and 65535.".to_string())?;
    if value == 0 {
        return Err("Port must be an integer between 1 and 65535.".to_string());
    }

    Ok(value.to_string())
}

#[cfg(test)]
mod tests {
    use super::{normalize_port, parse_forward_list};

    #[test]
    fn parses_forward_rules() {
        let rules = parse_forward_list(
            "emulator-5554 tcp:8080 tcp:9000\n",
            "emulator-5554",
            "forward",
        );

        assert_eq!(rules.len(), 1);
        assert_eq!(rules[0].local_port, "8080");
        assert_eq!(rules[0].remote_port, "9000");
    }

    #[test]
    fn parses_reverse_rules_with_device_port_first() {
        let rules = parse_forward_list(
            "emulator-5554 tcp:9000 tcp:8080\n",
            "emulator-5554",
            "reverse",
        );

        assert_eq!(rules.len(), 1);
        assert_eq!(rules[0].local_port, "8080");
        assert_eq!(rules[0].remote_port, "9000");
    }

    #[test]
    fn parses_forward_rules_without_trusting_serial_column() {
        let rules = parse_forward_list(
            "other-device tcp:8080 tcp:9000\n",
            "emulator-5554",
            "forward",
        );

        assert_eq!(rules.len(), 1);
        assert_eq!(rules[0].local_port, "8080");
        assert_eq!(rules[0].remote_port, "9000");
    }

    #[test]
    fn parses_reverse_rules_with_transport_label() {
        let rules = parse_forward_list("UsbFfs tcp:9000 tcp:8080\n", "emulator-5554", "reverse");

        assert_eq!(rules.len(), 1);
        assert_eq!(rules[0].local_port, "8080");
        assert_eq!(rules[0].remote_port, "9000");
    }

    #[test]
    fn validates_port_range() {
        assert_eq!(normalize_port(" 8080 ").unwrap(), "8080");
        assert!(normalize_port("0").is_err());
        assert!(normalize_port("65536").is_err());
        assert!(normalize_port("abc").is_err());
    }
}
