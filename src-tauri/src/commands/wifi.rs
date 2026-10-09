use crate::{error::AppError, error_codes as codes};
use std::net::{IpAddr, Ipv4Addr, UdpSocket};
use std::sync::LazyLock;
use std::time::Duration;

use regex::Regex;
use tauri::AppHandle;

use super::device::{run_adb, run_adb_with_serial};

#[tauri::command]
pub fn adb_connect(app: AppHandle, address: String) -> Result<String, AppError> {
    let addr = normalize_address(&address)?;
    run_adb_connect(&app, &addr)
}

#[tauri::command]
pub fn adb_disconnect(app: AppHandle, address: String) -> Result<String, AppError> {
    let addr = normalize_address(&address)?;
    run_adb(&app, &["disconnect", &addr]).map(|output| output.trim().to_string())
}

#[tauri::command]
pub fn enable_wifi_debugging(app: AppHandle, serial: String) -> Result<String, AppError> {
    let ip = get_device_wifi_ip(&app, &serial)?;
    run_adb_with_serial(&app, &serial, &["tcpip", "5555"])
        .map_err(|e| AppError::new(codes::WIFI_TCPIP_FAILED).cause(e))?;
    std::thread::sleep(Duration::from_millis(1500));

    let addr = format!("{ip}:5555");
    run_adb_connect(&app, &addr)?;
    Ok(addr)
}

fn run_adb_connect(app: &AppHandle, addr: &str) -> Result<String, AppError> {
    run_adb_connect_with(addr, |args| run_adb(app, args))
}

fn run_adb_connect_with<F>(addr: &str, mut execute: F) -> Result<String, AppError>
where
    F: FnMut(&[&str]) -> Result<String, AppError>,
{
    let output = execute(&["connect", addr])?;
    validate_connect_output(&output)?;

    if verify_device_online(addr, &mut execute).is_ok() {
        return Ok(output.trim().to_string());
    }

    // `adb connect` can report an offline cached transport as already connected.
    execute(&["disconnect", addr]).map_err(|e| {
        AppError::new(codes::WIFI_STALE_CLEANUP_FAILED)
            .param("address", addr)
            .cause(e)
    })?;

    let output = execute(&["connect", addr]).map_err(|e| {
        AppError::new(codes::WIFI_RECONNECT_FAILED)
            .param("address", addr)
            .cause(e)
    })?;
    validate_connect_output(&output).map_err(|e| {
        AppError::new(codes::WIFI_RECONNECT_FAILED)
            .param("address", addr)
            .cause(e)
    })?;
    verify_device_online(addr, &mut execute).map_err(|e| {
        AppError::new(codes::WIFI_STILL_UNAVAILABLE)
            .param("address", addr)
            .cause(e)
    })?;

    Ok(output.trim().to_string())
}

fn validate_connect_output(output: &str) -> Result<(), AppError> {
    let trimmed = output.trim();
    let lower = trimmed.to_lowercase();
    if lower.contains("failed") || lower.contains("unable") || lower.contains("cannot") {
        Err(AppError::new(codes::WIFI_CONNECT_FAILED).detail(trimmed))
    } else {
        Ok(())
    }
}

fn verify_device_online<F>(addr: &str, execute: &mut F) -> Result<(), AppError>
where
    F: FnMut(&[&str]) -> Result<String, AppError>,
{
    let state = execute(&["-s", addr, "get-state"])?;
    let state = state.trim();
    if state == "device" {
        Ok(())
    } else {
        Err(if state.is_empty() {
            AppError::new(codes::WIFI_UNKNOWN_STATE)
        } else {
            AppError::new(codes::WIFI_UNEXPECTED_STATE).param("state", state)
        })
    }
}

fn get_device_wifi_ip(app: &AppHandle, serial: &str) -> Result<String, AppError> {
    // Read every interface: a hotspot address lives on ap0/wlan1/swlan0, not wlan0.
    let output = run_adb_with_serial(app, serial, &["shell", "ip", "-f", "inet", "addr", "show"])
        .map_err(|e| AppError::new(codes::WIFI_READ_IP_FAILED).cause(e))?;
    select_wifi_ip(&parse_inet_addrs(&output), host_source_address)
        .map(|ip| ip.to_string())
        .ok_or_else(|| AppError::new(codes::WIFI_NO_IP))
}

#[derive(Debug, PartialEq)]
struct InetAddr {
    interface: String,
    ip: Ipv4Addr,
    prefix: u8,
}

static INTERFACE_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^\d+:\s+([^\s:@]+)").unwrap());
static INET_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\binet\s+(\d+\.\d+\.\d+\.\d+)/(\d+)").unwrap());

// Accepts both the multi-line and `-o` layouts of `ip addr show`.
fn parse_inet_addrs(output: &str) -> Vec<InetAddr> {
    let mut interface = None;
    let mut addrs = Vec::new();
    for line in output.lines() {
        if let Some(captures) = INTERFACE_RE.captures(line) {
            interface = Some(captures[1].to_string());
        }
        let (Some(interface), Some(captures)) = (&interface, INET_RE.captures(line)) else {
            continue;
        };
        if let (Ok(ip), Ok(prefix @ 0..=32)) = (captures[1].parse(), captures[2].parse()) {
            addrs.push(InetAddr {
                interface: interface.clone(),
                ip,
                prefix,
            });
        }
    }
    addrs
}

/// Prefers an address whose subnet the host reaches directly, then wlan0, then
/// other WiFi/hotspot interfaces. Any other usable interface (e.g. Ethernet) is
/// chosen only when the host is on its subnet.
fn select_wifi_ip(
    addrs: &[InetAddr],
    host_source: impl Fn(Ipv4Addr) -> Option<Ipv4Addr>,
) -> Option<Ipv4Addr> {
    addrs
        .iter()
        .filter(|addr| !addr.ip.is_loopback() && !addr.ip.is_link_local())
        .filter_map(|addr| {
            let on_link =
                host_source(addr.ip).is_some_and(|host| same_subnet(host, addr.ip, addr.prefix));
            let rank = if addr.interface == "wlan0" {
                0
            } else if is_wifi_interface(&addr.interface) {
                1
            } else if on_link && !is_unusable_interface(&addr.interface) {
                2
            } else {
                return None;
            };
            Some((!on_link, rank, addr.ip))
        })
        .min_by_key(|(off_link, rank, _)| (*off_link, *rank))
        .map(|(_, _, ip)| ip)
}

fn is_wifi_interface(name: &str) -> bool {
    ["wlan", "swlan", "ap", "softap", "wifi"]
        .iter()
        .any(|prefix| name.starts_with(prefix))
}

// Cellular, VPN and USB-tethering links cannot carry a wireless ADB session.
fn is_unusable_interface(name: &str) -> bool {
    [
        "rmnet", "ccmni", "v4-", "clat", "pdp", "seth", "ppp", "tun", "rndis", "usb", "ncm",
    ]
    .iter()
    .any(|prefix| name.starts_with(prefix))
}

fn same_subnet(a: Ipv4Addr, b: Ipv4Addr, prefix: u8) -> bool {
    if prefix == 0 {
        return false;
    }
    let mask = u32::MAX << (32 - u32::from(prefix));
    u32::from(a) & mask == u32::from(b) & mask
}

// Connecting a UDP socket sends nothing; it only asks the OS which local
// address would route to `target`.
fn host_source_address(target: Ipv4Addr) -> Option<Ipv4Addr> {
    let socket = UdpSocket::bind((Ipv4Addr::UNSPECIFIED, 0)).ok()?;
    socket.connect((target, 5555)).ok()?;
    match socket.local_addr().ok()?.ip() {
        IpAddr::V4(ip) if !ip.is_unspecified() => Some(ip),
        _ => None,
    }
}

fn normalize_address(address: &str) -> Result<String, AppError> {
    let trimmed = address.trim();
    if trimmed.is_empty() {
        return Err(AppError::new(codes::WIFI_EMPTY_ADDRESS));
    }
    if trimmed.contains(':') {
        Ok(trimmed.to_string())
    } else {
        Ok(format!("{trimmed}:5555"))
    }
}

#[cfg(test)]
mod tests {
    use crate::error_codes as codes;
    use std::collections::VecDeque;

    use super::run_adb_connect_with;
    use crate::error::AppError;

    type ScriptResult<'a> = Result<&'a str, &'a str>;

    fn run_connect_script(
        script: Vec<ScriptResult<'_>>,
    ) -> (Result<String, AppError>, Vec<Vec<String>>) {
        let mut responses: VecDeque<Result<String, AppError>> = script
            .into_iter()
            .map(|result| {
                result
                    .map(str::to_string)
                    .map_err(|detail| AppError::new(codes::ADB_EXECUTE_FAILED).detail(detail))
            })
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

        let error = result.unwrap_err();
        assert_eq!(error.code, codes::WIFI_RECONNECT_FAILED);
        assert_eq!(error.params["address"], "192.168.1.10:5555".into());
        assert_eq!(
            error.causes[0].detail.as_deref(),
            Some("failed to connect to 192.168.1.10:5555")
        );
        assert_eq!(calls.len(), 4);
    }

    use super::{parse_inet_addrs, select_wifi_ip, InetAddr};
    use std::net::Ipv4Addr;

    const HOTSPOT_OUTPUT: &str = "\
1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN group default qlen 1000
    inet 127.0.0.1/8 scope host lo
       valid_lft forever preferred_lft forever
12: rmnet_data2@rmnet_ipa0: <UP,LOWER_UP> mtu 1500 qdisc mq state UNKNOWN group default qlen 1000
    inet 10.62.18.7/30 scope global rmnet_data2
       valid_lft forever preferred_lft forever
31: wlan0: <NO-CARRIER,BROADCAST,MULTICAST,UP> mtu 1500 qdisc mq state DOWN group default qlen 3000
45: ap0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc mq state UP group default qlen 3000
    inet 192.168.43.1/24 brd 192.168.43.255 scope global ap0
       valid_lft forever preferred_lft forever
";

    fn addr(interface: &str, ip: [u8; 4], prefix: u8) -> InetAddr {
        InetAddr {
            interface: interface.to_string(),
            ip: Ipv4Addr::from(ip),
            prefix,
        }
    }

    fn no_route(_: Ipv4Addr) -> Option<Ipv4Addr> {
        None
    }

    #[test]
    fn parses_addresses_from_every_interface_in_both_ip_layouts() {
        let expected = vec![
            addr("lo", [127, 0, 0, 1], 8),
            addr("rmnet_data2", [10, 62, 18, 7], 30),
            addr("ap0", [192, 168, 43, 1], 24),
        ];
        assert_eq!(parse_inet_addrs(HOTSPOT_OUTPUT), expected);

        let oneline = "\
1: lo    inet 127.0.0.1/8 scope host lo\\       valid_lft forever preferred_lft forever
12: rmnet_data2    inet 10.62.18.7/30 scope global rmnet_data2\\       valid_lft forever
45: ap0    inet 192.168.43.1/24 brd 192.168.43.255 scope global ap0\\       valid_lft forever
";
        assert_eq!(parse_inet_addrs(oneline), expected);
    }

    #[test]
    fn picks_the_hotspot_address_when_wlan0_has_none() {
        let addrs = parse_inet_addrs(HOTSPOT_OUTPUT);
        assert_eq!(
            select_wifi_ip(&addrs, no_route),
            Some(Ipv4Addr::new(192, 168, 43, 1))
        );
    }

    #[test]
    fn prefers_the_interface_on_the_host_subnet() {
        let addrs = vec![
            addr("wlan0", [192, 168, 1, 20], 24),
            addr("wlan1", [10, 106, 5, 1], 24),
        ];
        let on_hotspot =
            |target: Ipv4Addr| (target.octets()[0] == 10).then_some(Ipv4Addr::new(10, 106, 5, 77));
        assert_eq!(
            select_wifi_ip(&addrs, on_hotspot),
            Some(Ipv4Addr::new(10, 106, 5, 1))
        );
        // Without a direct route, keep the previous wlan0 behavior.
        assert_eq!(
            select_wifi_ip(&addrs, no_route),
            Some(Ipv4Addr::new(192, 168, 1, 20))
        );
    }

    #[test]
    fn never_picks_cellular_tethered_or_unreachable_wired_addresses() {
        let same_subnet = |target: Ipv4Addr| {
            let [a, b, c, _] = target.octets();
            Some(Ipv4Addr::new(a, b, c, 200))
        };
        let addrs = vec![
            addr("lo", [127, 0, 0, 1], 8),
            addr("rmnet_data0", [10, 0, 0, 2], 24),
            addr("rndis0", [192, 168, 42, 129], 24),
            addr("wlan0", [169, 254, 3, 4], 16),
        ];
        assert_eq!(select_wifi_ip(&addrs, same_subnet), None);

        let wired = vec![addr("eth0", [192, 168, 50, 9], 24)];
        assert_eq!(
            select_wifi_ip(&wired, same_subnet),
            Some(Ipv4Addr::new(192, 168, 50, 9))
        );
        assert_eq!(select_wifi_ip(&wired, no_route), None);
    }

    #[test]
    fn rejects_stdout_level_connect_failures_without_querying_state() {
        let (result, calls) =
            run_connect_script(vec![Ok("unable to connect to 192.168.1.10:5555")]);

        let error = result.unwrap_err();
        assert_eq!(error.code, codes::WIFI_CONNECT_FAILED);
        assert_eq!(
            error.detail.as_deref(),
            Some("unable to connect to 192.168.1.10:5555")
        );
        assert_eq!(calls, vec![vec!["connect", "192.168.1.10:5555"]]);
    }
}
