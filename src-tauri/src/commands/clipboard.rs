use crate::{error::AppError, error_codes as codes};
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
) -> Result<ClipboardResult, AppError> {
    run(&app, &serial, None).await
}

#[tauri::command]
pub async fn set_device_clipboard(
    app: AppHandle,
    serial: String,
    text: String,
) -> Result<(), AppError> {
    run(&app, &serial, Some(&text)).await.map(|_| ())
}

fn validate_text(text: &str) -> Result<(), AppError> {
    if text.is_empty() {
        return Err(AppError::new(codes::CLIPBOARD_NO_TEXT));
    }
    if text.len() > MAX_TEXT_BYTES {
        return Err(AppError::new(codes::CLIPBOARD_TOO_LARGE));
    }
    Ok(())
}

fn encode_request(text: Option<&str>) -> Result<Vec<u8>, AppError> {
    if let Some(text) = text {
        validate_text(text)?;
    }
    serde_json::to_vec(&Request {
        version: 1,
        operation: if text.is_some() { "set" } else { "get" },
        text,
    })
    .map_err(|error| AppError::new(codes::CLIPBOARD_ENCODE_FAILED).detail(error.to_string()))
}

async fn run(
    app: &AppHandle,
    serial: &str,
    text: Option<&str>,
) -> Result<ClipboardResult, AppError> {
    let request = encode_request(text)?;
    let local = device_helper::resolve_app_info_dex_path(app)?;
    let dex = std::fs::read(&local).map_err(|error| {
        AppError::new(codes::CLIPBOARD_READ_DEX_FAILED).detail(error.to_string())
    })?;
    let remote = device_helper::remote_dex_path(device_helper::fnv1a_64(&dex));
    device_helper::ensure_dex_pushed(app, serial, &local, &remote, dex.len() as u64, false)
        .await
        .map_err(|error| AppError::new(codes::CLIPBOARD_PREPARE_DEX_FAILED).cause(error))?;
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
            AppError::new(codes::CLIPBOARD_WRITE_UNCONFIRMED).cause(error)
        } else {
            error
        }
    })
}

fn helper_command(remote: &str) -> String {
    format!("CLASSPATH={remote} /system/bin/toybox timeout -s KILL {DEVICE_TIMEOUT_SECS} app_process /data/local/tmp com.adbgui.clipboard.Main")
}

async fn read_bounded(reader: impl AsyncRead + Unpin, limit: usize) -> Result<Vec<u8>, AppError> {
    let mut output = Vec::new();
    reader
        .take(limit as u64 + 1)
        .read_to_end(&mut output)
        .await
        .map_err(|error| {
            AppError::new(codes::CLIPBOARD_READ_OUTPUT_FAILED).detail(error.to_string())
        })?;
    if output.len() > limit {
        return Err(AppError::new(codes::CLIPBOARD_OUTPUT_TOO_LARGE));
    }
    Ok(output)
}

async fn exchange(
    command: &mut tokio::process::Command,
    request: &[u8],
    timeout: Duration,
) -> Result<(bool, Vec<u8>), AppError> {
    let mut child = command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|error| AppError::new(codes::CLIPBOARD_START_FAILED).detail(error.to_string()))?;
    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| AppError::new(codes::CLIPBOARD_MISSING_STDIN))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| AppError::new(codes::CLIPBOARD_MISSING_STDOUT))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| AppError::new(codes::CLIPBOARD_MISSING_STDERR))?;
    let result = tokio::time::timeout(timeout, async {
        tokio::try_join!(
            async {
                stdin.write_all(request).await.map_err(|error| {
                    AppError::new(codes::CLIPBOARD_SEND_FAILED).detail(error.to_string())
                })?;
                drop(stdin);
                Ok::<_, AppError>(())
            },
            read_bounded(stdout, MAX_WIRE_BYTES),
            read_bounded(stderr, 4096),
            async {
                child.wait().await.map_err(|error| {
                    AppError::new(codes::CLIPBOARD_WAIT_FAILED).detail(error.to_string())
                })
            },
        )
    })
    .await;
    let error = match result {
        Ok(Ok(((), stdout, _stderr, status))) => return Ok((status.success(), stdout)),
        Ok(Err(error)) => error,
        Err(_) => AppError::new(codes::CLIPBOARD_TIMEOUT),
    };
    child.kill().await.map_err(|cleanup| {
        AppError::new(codes::CLIPBOARD_KILL_FAILED)
            .detail(cleanup.to_string())
            .cause(error.clone())
    })?;
    child.wait().await.map_err(|cleanup| {
        AppError::new(codes::CLIPBOARD_REAP_FAILED)
            .detail(cleanup.to_string())
            .cause(error.clone())
    })?;
    Err(error)
}

fn parse_response(
    stdout: &[u8],
    success: bool,
    writing: bool,
) -> Result<ClipboardResult, AppError> {
    let invalid = || AppError::new(codes::CLIPBOARD_INVALID_RESPONSE);
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
        return Err(AppError::new(match error.code.as_str() {
            "locked" => codes::CLIPBOARD_LOCKED,
            "user" => codes::CLIPBOARD_USER,
            "permission" | "identity" => codes::CLIPBOARD_PERMISSION,
            "no_text" => codes::CLIPBOARD_DEVICE_NO_TEXT,
            "too_large" => codes::CLIPBOARD_TOO_LARGE,
            "unverified" => codes::CLIPBOARD_UNVERIFIED,
            "request" | "version" => codes::CLIPBOARD_PROTOCOL,
            _ => codes::CLIPBOARD_UNSUPPORTED,
        }));
    }
    if !success {
        return Err(AppError::new(codes::CLIPBOARD_ABNORMAL_EXIT));
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
            assert!(!serde_json::to_string(&error).unwrap().contains("secret"));
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
        assert_eq!(
            parse_response(&locked, false, false).unwrap_err().code,
            codes::CLIPBOARD_LOCKED
        );
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
        assert_eq!(
            exchange(&mut slow, b"", Duration::from_millis(20))
                .await
                .unwrap_err()
                .code,
            codes::CLIPBOARD_TIMEOUT
        );
        let mut noisy = tokio::process::Command::new("/bin/sh");
        noisy.args(["-c", "head -c 5000 /dev/zero >&2"]);
        assert_eq!(
            exchange(&mut noisy, b"", Duration::from_secs(2))
                .await
                .unwrap_err()
                .code,
            codes::CLIPBOARD_OUTPUT_TOO_LARGE
        );
    }
}
