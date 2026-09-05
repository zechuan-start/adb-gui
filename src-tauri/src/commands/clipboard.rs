use serde::{Deserialize, Serialize};
use std::process::Stdio;
use std::time::Duration;
use tauri::AppHandle;
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWriteExt};

use crate::{adb, device_helper};

const SENTINEL: &[u8] = b"--ADBGUI-CLIPBOARD-V1--";
const MAX_TEXT_BYTES: usize = 256 * 1024;
const MAX_WIRE_BYTES: usize = MAX_TEXT_BYTES * 6 + 4096;
const DEVICE_TIMEOUT_SECS: u64 = 8;
const HOST_TIMEOUT: Duration = Duration::from_secs(DEVICE_TIMEOUT_SECS + 2);

#[derive(Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum ClipboardResult {
    Text { text: String },
    NoText,
    Written,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Envelope {
    version: u32,
    ok: bool,
    result: Option<ClipboardResult>,
    error: Option<ClipboardError>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ClipboardError {
    code: String,
}

#[derive(Serialize)]
struct Request<'a> {
    version: u32,
    operation: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    text: Option<&'a str>,
}

#[tauri::command]
pub async fn get_device_clipboard(
    app: AppHandle,
    serial: String,
) -> Result<ClipboardResult, String> {
    run(&app, &serial, None).await
}

#[tauri::command]
pub async fn set_device_clipboard(
    app: AppHandle,
    serial: String,
    text: String,
) -> Result<(), String> {
    run(&app, &serial, Some(&text)).await.map(|_| ())
}

fn validate_text(text: &str) -> Result<(), String> {
    if text.is_empty() {
        return Err("剪贴板没有可用文本".to_string());
    }
    if text.len() > MAX_TEXT_BYTES {
        return Err("剪贴板文本超过 256 KiB 限制".to_string());
    }
    Ok(())
}

fn encode_request(text: Option<&str>) -> Result<Vec<u8>, String> {
    if let Some(text) = text {
        validate_text(text)?;
    }
    serde_json::to_vec(&Request {
        version: 1,
        operation: if text.is_some() { "set" } else { "get" },
        text,
    })
    .map_err(|_| "无法编码剪贴板请求".to_string())
}

async fn run(app: &AppHandle, serial: &str, text: Option<&str>) -> Result<ClipboardResult, String> {
    let request = encode_request(text)?;
    let local = device_helper::resolve_app_info_dex_path(app)?;
    let dex = std::fs::read(&local).map_err(|_| "无法读取剪贴板 DEX".to_string())?;
    let remote = device_helper::remote_dex_path(device_helper::fnv1a_64(&dex));
    device_helper::ensure_dex_pushed(app, serial, &local, &remote, dex.len() as u64, false)
        .await
        .map_err(|error| format!("准备剪贴板 DEX 失败: {error}"))?;
    let adb_path = adb::resolve_adb_path(app)?;
    let mut command = adb::prepare_async_command(app, &adb_path);
    command.args([
        "-s",
        serial,
        "shell",
        "-T",
        "-e",
        "none",
        &helper_command(&remote),
    ]);
    // A submitted set may already have changed the device even if its response is lost.
    let result = async {
        let (success, stdout) = exchange(&mut command, &request, HOST_TIMEOUT).await?;
        parse_response(&stdout, success, text.is_some())
    }
    .await;
    result.map_err(|error| {
        if text.is_some() {
            format!("{error}. 本次写入结果未确认, 不会自动重试")
        } else {
            error
        }
    })
}

fn helper_command(remote: &str) -> String {
    format!("CLASSPATH={remote} /system/bin/toybox timeout -s KILL {DEVICE_TIMEOUT_SECS} app_process /data/local/tmp com.adbgui.clipboard.Main")
}

async fn read_bounded(reader: impl AsyncRead + Unpin, limit: usize) -> Result<Vec<u8>, String> {
    let mut output = Vec::new();
    reader
        .take(limit as u64 + 1)
        .read_to_end(&mut output)
        .await
        .map_err(|_| "读取剪贴板进程输出失败".to_string())?;
    if output.len() > limit {
        return Err("剪贴板进程输出超过限制".to_string());
    }
    Ok(output)
}

async fn exchange(
    command: &mut tokio::process::Command,
    request: &[u8],
    timeout: Duration,
) -> Result<(bool, Vec<u8>), String> {
    let mut child = command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|_| "无法启动剪贴板进程".to_string())?;
    let mut stdin = child.stdin.take().ok_or("缺少剪贴板输入管道")?;
    let stdout = child.stdout.take().ok_or("缺少剪贴板输出管道")?;
    let stderr = child.stderr.take().ok_or("缺少剪贴板错误管道")?;
    let result = tokio::time::timeout(timeout, async {
        tokio::try_join!(
            async {
                stdin
                    .write_all(request)
                    .await
                    .map_err(|_| "发送剪贴板请求失败".to_string())?;
                drop(stdin);
                Ok::<_, String>(())
            },
            read_bounded(stdout, MAX_WIRE_BYTES),
            read_bounded(stderr, 4096),
            async {
                child
                    .wait()
                    .await
                    .map_err(|_| "等待剪贴板进程失败".to_string())
            },
        )
    })
    .await;
    let error = match result {
        Ok(Ok(((), stdout, _stderr, status))) => return Ok((status.success(), stdout)),
        Ok(Err(error)) => error,
        Err(_) => "剪贴板操作超时".to_string(),
    };
    child
        .kill()
        .await
        .map_err(|_| format!("{error}; 终止剪贴板进程失败"))?;
    child
        .wait()
        .await
        .map_err(|_| format!("{error}; 回收剪贴板进程失败"))?;
    Err(error)
}

fn parse_response(stdout: &[u8], success: bool, writing: bool) -> Result<ClipboardResult, String> {
    let invalid = || "剪贴板助手响应无效或版本不兼容".to_string();
    if stdout.len() > MAX_WIRE_BYTES {
        return Err(invalid());
    }
    let mut offset = 0;
    let mut payload = None;
    for line in stdout.split_inclusive(|byte| *byte == b'\n') {
        offset += line.len();
        if line
            .strip_suffix(b"\n")
            .map(|line| line.strip_suffix(b"\r").unwrap_or(line))
            == Some(SENTINEL)
        {
            if payload.is_some() {
                return Err(invalid());
            }
            payload = Some(&stdout[offset..]);
        }
    }
    let envelope: Envelope =
        serde_json::from_slice(payload.ok_or_else(invalid)?).map_err(|_| invalid())?;
    if envelope.version != 1 {
        return Err(invalid());
    }
    if !envelope.ok {
        if envelope.result.is_some() {
            return Err(invalid());
        }
        let error = envelope.error.ok_or_else(invalid)?;
        return Err(match error.code.as_str() {
            "locked" => "手机已锁屏, 请解锁后重试",
            "user" => "仅支持主用户的剪贴板",
            "permission" | "identity" => "系统拒绝 shell 剪贴板访问",
            "no_text" => "手机剪贴板没有可用文本",
            "too_large" => "剪贴板文本超过 256 KiB 限制",
            "unverified" => "手机未返回一致的写入内容",
            "request" | "version" => "剪贴板协议不兼容",
            _ => "此设备不支持当前剪贴板助手",
        }
        .to_string());
    }
    if !success {
        return Err("剪贴板进程未正常退出, 请检查设备连接".to_string());
    }
    if envelope.error.is_some() {
        return Err(invalid());
    }
    match envelope.result.ok_or_else(invalid)? {
        ClipboardResult::Written if writing => Ok(ClipboardResult::Written),
        ClipboardResult::NoText if !writing => Ok(ClipboardResult::NoText),
        ClipboardResult::Text { text } if !writing => {
            validate_text(&text)?;
            Ok(ClipboardResult::Text { text })
        }
        _ => Err(invalid()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn response(value: serde_json::Value) -> Vec<u8> {
        let mut bytes = SENTINEL.to_vec();
        bytes.push(b'\n');
        bytes.extend(serde_json::to_vec(&value).unwrap());
        bytes
    }

    #[test]
    fn preserves_text_and_embedded_markers() {
        let text = " \r\n中文\n😀\"'`$()\n--ADBGUI-CLIPBOARD-V1--\n ";
        let request: serde_json::Value =
            serde_json::from_slice(&encode_request(Some(text)).unwrap()).unwrap();
        assert_eq!(request["text"], text);
        let output = response(
            serde_json::json!({"version":1,"ok":true,"result":{"kind":"text","text":text}}),
        );
        assert_eq!(
            parse_response(&output, true, false).unwrap(),
            ClipboardResult::Text { text: text.into() }
        );
    }

    #[test]
    fn enforces_utf8_size_and_allows_json_escape_expansion() {
        assert!(encode_request(Some(&"中".repeat(MAX_TEXT_BYTES / 3 + 1))).is_err());
        assert!(encode_request(Some("")).is_err());
        let wire = encode_request(Some(&"\0".repeat(MAX_TEXT_BYTES))).unwrap();
        assert!(wire.len() > MAX_TEXT_BYTES);
        assert!(wire.len() <= MAX_WIRE_BYTES);
    }

    #[test]
    fn rejects_wrong_types_versions_framing_and_exit_status_without_echoing_data() {
        for json in [
            serde_json::json!({"version":2,"ok":true,"result":{"kind":"written"}}),
            serde_json::json!({"version":1,"ok":true,"result":{"kind":"text","text":"secret"}}),
            serde_json::json!({"version":1,"ok":true,"result":{"kind":"written"},"error":{"code":"secret"}}),
            serde_json::json!({"version":1,"ok":false}),
        ] {
            let error = parse_response(&response(json), true, true).unwrap_err();
            assert!(!error.contains("secret"));
        }
        let output =
            response(serde_json::json!({"version":1,"ok":true,"result":{"kind":"written"}}));
        assert!(parse_response(&output, false, true).is_err());
        assert!(parse_response(&output, true, false).is_err());
        assert!(parse_response(b"secret --ADBGUI-CLIPBOARD-V1--\n{}", true, false).is_err());
        assert!(parse_response(b"", true, false).is_err());
        assert!(parse_response(b"[]", true, false).is_err());
        assert!(parse_response(&[output.as_slice(), b"{}"].concat(), true, true).is_err());
        assert!(parse_response(&[SENTINEL, b"\n", &output].concat(), true, true).is_err());
    }

    #[test]
    fn surfaces_locked_and_no_text_without_fabricating_success() {
        let locked =
            response(serde_json::json!({"version":1,"ok":false,"error":{"code":"locked"}}));
        assert!(parse_response(&locked, false, false)
            .unwrap_err()
            .contains("锁屏"));
        let empty =
            response(serde_json::json!({"version":1,"ok":true,"result":{"kind":"no_text"}}));
        assert_eq!(
            parse_response(&empty, true, false).unwrap(),
            ClipboardResult::NoText
        );
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn pipes_large_input_without_deadlock_and_bounds_execution() {
        let mut echo = tokio::process::Command::new("/bin/cat");
        let input = vec![b'x'; MAX_TEXT_BYTES];
        let (success, output) = exchange(&mut echo, &input, Duration::from_secs(2))
            .await
            .unwrap();
        assert!(success);
        assert_eq!(input, output);
        let mut slow = tokio::process::Command::new("/bin/sleep");
        slow.arg("2");
        assert!(exchange(&mut slow, b"", Duration::from_millis(20))
            .await
            .unwrap_err()
            .contains("超时"));
        let mut noisy = tokio::process::Command::new("/bin/sh");
        noisy.args(["-c", "head -c 5000 /dev/zero >&2"]);
        assert!(exchange(&mut noisy, b"", Duration::from_secs(2))
            .await
            .unwrap_err()
            .contains("超过限制"));
    }
}
