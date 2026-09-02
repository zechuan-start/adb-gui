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
    run_adb_connect_with(addr, |args| run_adb(app, args))
}

fn run_adb_connect_with<F>(addr: &str, mut execute: F) -> Result<String, String>
where
    F: FnMut(&[&str]) -> Result<String, String>,
{
    let output = execute(&["connect", addr])?;
    validate_connect_output(&output)?;

    if verify_device_online(addr, &mut execute).is_ok() {
        return Ok(output.trim().to_string());
    }

    // `adb connect` can report an offline cached transport as already connected.
    execute(&["disconnect", addr])
        .map_err(|e| format!("设备 {addr} 未进入在线状态, 且清理旧连接失败: {e}"))?;

    let output = execute(&["connect", addr])
        .map_err(|e| format!("设备 {addr} 未进入在线状态, 重新连接失败: {e}"))?;
    validate_connect_output(&output)
        .map_err(|e| format!("设备 {addr} 未进入在线状态, 重新连接失败: {e}"))?;
    verify_device_online(addr, &mut execute)
        .map_err(|e| format!("设备 {addr} 重新连接后仍不可用: {e}"))?;

    Ok(output.trim().to_string())
}

fn validate_connect_output(output: &str) -> Result<(), String> {
    let trimmed = output.trim();
    let lower = trimmed.to_lowercase();
    if lower.contains("failed") || lower.contains("unable") || lower.contains("cannot") {
        Err(trimmed.to_string())
    } else {
        Ok(())
    }
}

fn verify_device_online<F>(addr: &str, execute: &mut F) -> Result<(), String>
where
    F: FnMut(&[&str]) -> Result<String, String>,
{
    let state = execute(&["-s", addr, "get-state"])?;
    let state = state.trim();
    if state == "device" {
        Ok(())
    } else {
        Err(format!(
            "ADB 状态为 {}",
            if state.is_empty() { "未知" } else { state }
        ))
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

#[cfg(test)]
mod tests {
    use std::collections::VecDeque;

    use super::run_adb_connect_with;

    type ScriptResult<'a> = Result<&'a str, &'a str>;

    fn run_connect_script(
        script: Vec<ScriptResult<'_>>,
    ) -> (Result<String, String>, Vec<Vec<String>>) {
        let mut responses: VecDeque<Result<String, String>> = script
            .into_iter()
            .map(|result| result.map(str::to_string).map_err(str::to_string))
            .collect();
        let mut calls = Vec::new();
        let result = run_adb_connect_with("192.168.1.10:5555", |args| {
            calls.push(args.iter().map(|arg| (*arg).to_string()).collect());
            responses
                .pop_front()
                .expect("test script must include one response per ADB call")
        });
        assert!(
            responses.is_empty(),
            "test script contains unused responses"
        );
        (result, calls)
    }

    #[test]
    fn accepts_connect_only_after_the_target_is_online() {
        let (result, calls) =
            run_connect_script(vec![Ok("connected to 192.168.1.10:5555\n"), Ok("device\n")]);

        assert_eq!(result.as_deref(), Ok("connected to 192.168.1.10:5555"));
        assert_eq!(
            calls,
            vec![
                vec!["connect", "192.168.1.10:5555"],
                vec!["-s", "192.168.1.10:5555", "get-state"],
            ]
        );
    }

    #[test]
    fn keeps_an_already_connected_online_transport() {
        let (result, calls) = run_connect_script(vec![
            Ok("already connected to 192.168.1.10:5555\n"),
            Ok("device\n"),
        ]);

        assert_eq!(
            result.as_deref(),
            Ok("already connected to 192.168.1.10:5555")
        );
        assert_eq!(
            calls,
            vec![
                vec!["connect", "192.168.1.10:5555"],
                vec!["-s", "192.168.1.10:5555", "get-state"],
            ]
        );
    }

    #[test]
    fn recovers_an_already_connected_offline_transport() {
        let (result, calls) = run_connect_script(vec![
            Ok("already connected to 192.168.1.10:5555\n"),
            Err("error: device offline"),
            Ok("disconnected 192.168.1.10:5555\n"),
            Ok("connected to 192.168.1.10:5555\n"),
            Ok("device\n"),
        ]);

        assert_eq!(result.as_deref(), Ok("connected to 192.168.1.10:5555"));
        assert_eq!(
            calls,
            vec![
                vec!["connect", "192.168.1.10:5555"],
                vec!["-s", "192.168.1.10:5555", "get-state"],
                vec!["disconnect", "192.168.1.10:5555"],
                vec!["connect", "192.168.1.10:5555"],
                vec!["-s", "192.168.1.10:5555", "get-state"],
            ]
        );
    }

    #[test]
    fn reports_a_failed_reconnect_instead_of_false_success() {
        let (result, calls) = run_connect_script(vec![
            Ok("already connected to 192.168.1.10:5555\n"),
            Err("error: device offline"),
            Ok("disconnected 192.168.1.10:5555\n"),
            Err("failed to connect to 192.168.1.10:5555"),
        ]);

        assert_eq!(
            result,
            Err("设备 192.168.1.10:5555 未进入在线状态, 重新连接失败: failed to connect to 192.168.1.10:5555".to_string())
        );
        assert_eq!(calls.len(), 4);
    }

    #[test]
    fn rejects_stdout_level_connect_failures_without_querying_state() {
        let (result, calls) =
            run_connect_script(vec![Ok("unable to connect to 192.168.1.10:5555")]);

        assert_eq!(
            result,
            Err("unable to connect to 192.168.1.10:5555".to_string())
        );
        assert_eq!(calls, vec![vec!["connect", "192.168.1.10:5555"]]);
    }
}
