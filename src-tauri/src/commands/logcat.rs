use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Arc, LazyLock,
};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tauri_plugin_opener::OpenerExt;
use tokio::io::{AsyncBufRead, AsyncBufReadExt, AsyncReadExt, BufReader};
use tokio::sync::Mutex;

use super::device::{adb_output_error, run_adb_output_with_serial, run_adb_with_serial};
use crate::adb;

const INITIAL_LOGCAT_LINES: &str = "5000";
const BATCH_MAX_LINES: usize = 200;
const BATCH_FLUSH_INTERVAL: Duration = Duration::from_millis(50);
const STDERR_TAIL_MAX_BYTES: usize = 2 * 1024;
const STDERR_JOIN_TIMEOUT: Duration = Duration::from_millis(250);
const CHILD_SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(3);
const FORMATTED_PROCESS_PS_ARGS: [&str; 5] = ["shell", "ps", "-A", "-o", "PID,NAME"];
const ALL_PROCESS_PS_ARGS: [&str; 3] = ["shell", "ps", "-A"];
const PLAIN_PROCESS_PS_ARGS: [&str; 2] = ["shell", "ps"];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ProcessPsAttempt {
    Formatted,
    All,
    Plain,
}

impl ProcessPsAttempt {
    fn args(self) -> &'static [&'static str] {
        match self {
            Self::Formatted => &FORMATTED_PROCESS_PS_ARGS,
            Self::All => &ALL_PROCESS_PS_ARGS,
            Self::Plain => &PLAIN_PROCESS_PS_ARGS,
        }
    }

    fn unsupported_option(self) -> Option<char> {
        match self {
            Self::Formatted => Some('o'),
            Self::All => Some('A'),
            Self::Plain => None,
        }
    }

    fn fallback(self) -> Option<Self> {
        match self {
            Self::Formatted => Some(Self::All),
            Self::All => Some(Self::Plain),
            Self::Plain => None,
        }
    }
}

struct LogcatSession {
    child: tokio::process::Child,
    session_id: u64,
}

static LOGCAT_SESSIONS: LazyLock<Mutex<HashMap<String, LogcatSession>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
static LOGCAT_START_LOCKS: LazyLock<Mutex<HashMap<String, Arc<Mutex<()>>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
static LOGCAT_SHUTTING_DOWN: AtomicBool = AtomicBool::new(false);
static NEXT_SESSION_ID: AtomicU64 = AtomicU64::new(1);

async fn logcat_start_lock(serial: &str) -> Arc<Mutex<()>> {
    let mut locks = LOGCAT_START_LOCKS.lock().await;
    Arc::clone(
        locks
            .entry(serial.to_string())
            .or_insert_with(|| Arc::new(Mutex::new(()))),
    )
}

fn should_flush_batch(line_count: usize, elapsed: Option<Duration>) -> bool {
    line_count >= BATCH_MAX_LINES
        || (line_count > 0 && elapsed.is_some_and(|duration| duration >= BATCH_FLUSH_INTERVAL))
}

fn session_matches(current_session_id: Option<u64>, requested_session_id: u64) -> bool {
    current_session_id == Some(requested_session_id)
}

fn drain_session_values<T>(sessions: &mut HashMap<String, T>) -> Vec<T> {
    sessions.drain().map(|(_, session)| session).collect()
}

async fn stop_all_sessions<T, Stop, StopFuture>(
    sessions: Vec<T>,
    mut stop: Stop,
) -> Result<(), String>
where
    Stop: FnMut(T) -> StopFuture,
    StopFuture: std::future::Future<Output = Result<(), String>>,
{
    let session_count = sessions.len();
    let mut failures = Vec::new();

    for session in sessions {
        if let Err(error) = stop(session).await {
            failures.push(error);
        }
    }

    if failures.is_empty() {
        return Ok(());
    }

    failures.sort();
    Err(format!(
        "Failed to stop {} of {session_count} Logcat sessions: {}",
        failures.len(),
        failures.join("; ")
    ))
}

async fn start_after_stopping<T, U, Stop, StopFuture, Start>(
    previous: Option<T>,
    stop: Stop,
    start: Start,
) -> Result<U, String>
where
    Stop: FnOnce(T) -> StopFuture,
    StopFuture: std::future::Future<Output = Result<(), String>>,
    Start: FnOnce() -> Result<U, String>,
{
    if let Some(previous) = previous {
        stop(previous).await?;
    }
    start()
}

async fn stop_logcat_session(mut session: LogcatSession) -> Result<(), String> {
    let session_id = session.session_id;
    let kill_error = session.child.start_kill().err();
    let wait_error = match tokio::time::timeout(CHILD_SHUTDOWN_TIMEOUT, session.child.wait()).await
    {
        Ok(Ok(_)) => None,
        Ok(Err(error)) => Some(format!("wait failed: {error}")),
        Err(_) => Some("wait timed out".to_string()),
    };

    match (kill_error, wait_error) {
        (_, None) => Ok(()),
        (None, Some(wait_error)) => Err(format!("Logcat session {session_id} {wait_error}")),
        (Some(kill_error), Some(wait_error)) => Err(format!(
            "Logcat session {session_id} kill failed: {kill_error}; {wait_error}"
        )),
    }
}

pub async fn shutdown_logcat_sessions() -> Result<(), String> {
    LOGCAT_SHUTTING_DOWN.store(true, Ordering::SeqCst);
    let sessions = {
        let mut sessions = LOGCAT_SESSIONS.lock().await;
        drain_session_values(&mut sessions)
    };

    stop_all_sessions(sessions, stop_logcat_session).await
}

fn build_exit_detail(read_error: Option<&str>, stderr_detail: &str) -> String {
    match (read_error, stderr_detail.is_empty()) {
        (Some(error), true) => error.to_string(),
        (Some(error), false) => format!("{error}\n{stderr_detail}"),
        (None, true) => "Logcat process exited (stdout EOF)".to_string(),
        (None, false) => stderr_detail.to_string(),
    }
}

fn decode_logcat_record(bytes: &[u8]) -> String {
    let content_end = if bytes.ends_with(b"\r\n") {
        bytes.len() - 2
    } else if bytes.ends_with(b"\n") {
        bytes.len() - 1
    } else {
        bytes.len()
    };

    String::from_utf8_lossy(&bytes[..content_end]).into_owned()
}

async fn read_logcat_record<R>(
    reader: &mut R,
    record_bytes: &mut Vec<u8>,
) -> std::io::Result<Option<String>>
where
    R: AsyncBufRead + Unpin,
{
    let bytes_read = reader.read_until(b'\n', record_bytes).await?;
    if bytes_read == 0 && record_bytes.is_empty() {
        return Ok(None);
    }

    let record = decode_logcat_record(record_bytes);
    record_bytes.clear();
    Ok(Some(record))
}

// threadtime format: `MM-DD HH:MM:SS.mmm  PID  TID LEVEL TAG : message`
// (tag may be empty or contain spaces, message may be empty)
static THREADTIME_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(
        r"^(\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}\.\d{3})\s+(\d+)\s+(\d+)\s+([VDIWEF])\s+(.*?)\s*:\s?(.*)$",
    )
    .unwrap()
});

#[derive(serde::Serialize, Clone)]
pub struct LogcatLine {
    pub time: String,
    pub level: String,
    pub tag: String,
    pub pid: String,
    pub tid: String,
    pub message: String,
    pub raw: String,
}

#[derive(serde::Serialize, Clone, Debug, PartialEq, Eq)]
pub struct ProcessEntry {
    pub pid: String,
    pub name: String,
}

#[derive(serde::Serialize, Clone)]
pub struct LogcatSessionInfo {
    pub serial: String,
    pub session_id: u64,
}

#[derive(serde::Serialize, Clone)]
pub struct LogcatBatch {
    pub serial: String,
    pub session_id: u64,
    pub lines: Vec<LogcatLine>,
}

#[derive(serde::Serialize, Clone)]
pub struct LogcatExit {
    pub serial: String,
    pub session_id: u64,
    pub reason: String,
    pub detail: String,
}

#[derive(serde::Serialize, Clone)]
pub struct ExportResult {
    pub path: String,
    pub revealed: bool,
}

#[tauri::command]
pub fn clear_logcat(app: AppHandle, serial: String) -> Result<(), String> {
    run_adb_with_serial(&app, &serial, &["logcat", "-c"]).map(|_| ())
}

#[tauri::command]
pub fn get_package_pids(
    app: AppHandle,
    serial: String,
    pkg: String,
) -> Result<Vec<String>, String> {
    let output = run_adb_output_with_serial(&app, &serial, &["shell", "pidof", &pkg])?;
    if output.status.success() {
        return Ok(String::from_utf8_lossy(&output.stdout)
            .split_whitespace()
            .map(ToString::to_string)
            .collect());
    }
    if is_pidof_no_process(
        output.status.code(),
        output.stdout.as_slice(),
        output.stderr.as_slice(),
    ) {
        return Ok(Vec::new());
    }
    Err(adb_output_error(&output))
}

fn is_pidof_no_process(status_code: Option<i32>, stdout: &[u8], stderr: &[u8]) -> bool {
    status_code == Some(1)
        && stdout.iter().all(u8::is_ascii_whitespace)
        && stderr.iter().all(u8::is_ascii_whitespace)
}

fn is_adb_connection_failure(diagnostic: &str) -> bool {
    const MARKERS: [&str; 10] = [
        "device offline",
        "unauthorized",
        "authorizing",
        "no devices/emulators found",
        "more than one device",
        "failed to get feature set",
        "transport error",
        "transport is closing",
        "connection reset",
        "protocol fault",
    ];

    MARKERS.iter().any(|marker| diagnostic.contains(marker))
        || (diagnostic.contains("device '") && diagnostic.contains("not found"))
        || (diagnostic.contains("device \"") && diagnostic.contains("not found"))
}

fn is_ps_option_unsupported(
    status_code: Option<i32>,
    stdout: &[u8],
    stderr: &[u8],
    option: char,
) -> bool {
    if status_code.is_none() || status_code == Some(0) {
        return false;
    }

    let diagnostic = format!(
        "{}\n{}",
        String::from_utf8_lossy(stdout),
        String::from_utf8_lossy(stderr)
    )
    .to_ascii_lowercase();
    if is_adb_connection_failure(&diagnostic) {
        return false;
    }

    let expected_option = option.to_ascii_lowercase().to_string();
    diagnostic.lines().any(|line| {
        let line = line.trim_start();
        let reports_unsupported_option = line.starts_with("ps:")
            && (line.contains("unknown option")
                || line.contains("invalid option")
                || line.contains("illegal option")
                || line.contains("unrecognized option")
                || line.contains("unsupported option")
                || line.contains("bad option")
                || line.contains("bad -")
                || line.contains("bad pid"));
        reports_unsupported_option
            && line
                .split(|character: char| !character.is_ascii_alphanumeric())
                .any(|token| token == expected_option)
    })
}

fn next_process_ps_attempt(
    attempt: ProcessPsAttempt,
    status_code: Option<i32>,
    stdout: &[u8],
    stderr: &[u8],
) -> Option<ProcessPsAttempt> {
    if attempt == ProcessPsAttempt::Formatted
        && is_ps_option_unsupported(status_code, stdout, stderr, 'A')
    {
        return Some(ProcessPsAttempt::Plain);
    }

    let option = attempt.unsupported_option()?;
    if is_ps_option_unsupported(status_code, stdout, stderr, option) {
        attempt.fallback()
    } else {
        None
    }
}

fn process_table_columns(fields: &[&str]) -> Option<(usize, usize)> {
    let pid_index = fields
        .iter()
        .position(|field| field.eq_ignore_ascii_case("PID"))?;
    let name_index = fields.iter().position(|field| {
        field.eq_ignore_ascii_case("NAME")
            || field.eq_ignore_ascii_case("CMD")
            || field.eq_ignore_ascii_case("COMMAND")
    })?;
    Some((pid_index, name_index))
}

fn parse_process_table(output: &str) -> Result<Vec<ProcessEntry>, String> {
    let mut columns = None;
    let mut entries = Vec::new();

    for line in output.lines() {
        let fields: Vec<&str> = line.split_whitespace().collect();
        if fields.is_empty() {
            continue;
        }
        if columns.is_none() {
            columns = process_table_columns(&fields);
            continue;
        }

        let Some((pid_index, name_index)) = columns else {
            continue;
        };
        let (Some(pid), Some(name)) = (fields.get(pid_index), fields.get(name_index)) else {
            continue;
        };
        if pid.is_empty() || !pid.bytes().all(|byte| byte.is_ascii_digit()) || name.is_empty() {
            continue;
        }
        entries.push(ProcessEntry {
            pid: (*pid).to_string(),
            name: (*name).to_string(),
        });
    }

    if columns.is_none() {
        return Err("Process table is missing PID and NAME/CMD/COMMAND headers".to_string());
    }
    Ok(entries)
}

#[tauri::command]
pub fn list_device_processes(app: AppHandle, serial: String) -> Result<Vec<ProcessEntry>, String> {
    let mut attempt = ProcessPsAttempt::Formatted;
    loop {
        let output = run_adb_output_with_serial(&app, &serial, attempt.args())?;
        if output.status.success() {
            let decoded = String::from_utf8_lossy(&output.stdout);
            return parse_process_table(&decoded)
                .map_err(|error| format!("Failed to parse device process table: {error}"));
        }
        if let Some(next_attempt) = next_process_ps_attempt(
            attempt,
            output.status.code(),
            &output.stdout,
            &output.stderr,
        ) {
            attempt = next_attempt;
            continue;
        }
        return Err(adb_output_error(&output));
    }
}

#[tauri::command]
pub fn export_logcat(
    app: AppHandle,
    serial: String,
    content: String,
) -> Result<ExportResult, String> {
    let save_dir = logcat_dir();
    std::fs::create_dir_all(&save_dir).map_err(|e| format!("Failed to create dir: {e}"))?;

    let timestamp = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();
    let safe_serial = serial.replace(['/', ':', ' '], "_");
    let file_path = save_dir.join(format!("{}-{}.log", safe_serial, timestamp));

    std::fs::write(&file_path, content).map_err(|e| format!("Failed to write file: {e}"))?;

    let path_str = file_path.to_string_lossy().to_string();
    let mut revealed = false;
    if let Err(err) = app.opener().reveal_item_in_dir(&path_str) {
        eprintln!("failed to reveal logcat export: {err}");
    } else {
        revealed = true;
    }

    Ok(ExportResult {
        path: path_str,
        revealed,
    })
}

#[tauri::command]
pub async fn start_logcat(app: AppHandle, serial: String) -> Result<LogcatSessionInfo, String> {
    let start_lock = logcat_start_lock(&serial).await;
    let _start_guard = start_lock.lock().await;
    if LOGCAT_SHUTTING_DOWN.load(Ordering::SeqCst) {
        return Err("Logcat session rejected: application is shutting down".to_string());
    }

    let session_id = NEXT_SESSION_ID
        .fetch_update(Ordering::Relaxed, Ordering::Relaxed, |current| {
            current.checked_add(1)
        })
        .map_err(|_| "Logcat session ID exhausted".to_string())?;
    let adb_path = adb::resolve_adb_path(&app)?;
    let previous = {
        let mut sessions = LOGCAT_SESSIONS.lock().await;
        sessions.remove(&serial)
    };

    // Wireless ADB transports can tear down a just-opened stream when an older
    // same-serial client exits. Confirm the old child is gone before spawning.
    let mut child = start_after_stopping(previous, stop_logcat_session, || {
        if LOGCAT_SHUTTING_DOWN.load(Ordering::SeqCst) {
            return Err("Logcat session rejected: application is shutting down".to_string());
        }
        adb::prepare_async_command(&app, &adb_path)
            .arg("-s")
            .arg(&serial)
            .arg("logcat")
            .arg("-T")
            .arg(INITIAL_LOGCAT_LINES)
            .arg("-v")
            .arg("threadtime")
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .kill_on_drop(true)
            .spawn()
            .map_err(|e| format!("Failed to start logcat: {e}"))
    })
    .await?;

    let stdout = match child.stdout.take() {
        Some(stdout) => stdout,
        None => {
            let _ = child.kill().await;
            return Err("Failed to capture logcat stdout".to_string());
        }
    };
    let stderr = match child.stderr.take() {
        Some(stderr) => stderr,
        None => {
            let _ = child.kill().await;
            return Err("Failed to capture logcat stderr".to_string());
        }
    };

    let registration = {
        let mut sessions = LOGCAT_SESSIONS.lock().await;
        if LOGCAT_SHUTTING_DOWN.load(Ordering::SeqCst) {
            Err((child, "application is shutting down"))
        } else if sessions.contains_key(&serial) {
            Err((child, "another session became active while restarting"))
        } else {
            sessions.insert(serial.clone(), LogcatSession { child, session_id });
            Ok(())
        }
    };
    match registration {
        Ok(()) => {}
        Err((child, reason)) => {
            let cleanup_result = stop_logcat_session(LogcatSession { child, session_id }).await;
            return match cleanup_result {
                Ok(()) => Err(format!("Logcat session {session_id} rejected: {reason}")),
                Err(cleanup_error) => Err(format!(
                    "Logcat session {session_id} rejected because {reason}; {cleanup_error}"
                )),
            };
        }
    }

    let stderr_tail = Arc::new(Mutex::new(Vec::with_capacity(STDERR_TAIL_MAX_BYTES)));
    let stderr_tail_writer = Arc::clone(&stderr_tail);
    let stderr_task = tokio::spawn(async move {
        let mut stderr = stderr;
        let mut chunk = [0_u8; 1024];

        loop {
            match stderr.read(&mut chunk).await {
                Ok(0) => break,
                Ok(read) => {
                    let mut tail = stderr_tail_writer.lock().await;
                    append_stderr_tail(&mut tail, &chunk[..read]);
                }
                Err(err) => {
                    eprintln!("failed to read logcat stderr: {err}");
                    break;
                }
            }
        }
    });

    let app_clone = app.clone();
    let reader_serial = serial.clone();

    tokio::spawn(async move {
        let mut reader = BufReader::new(stdout);
        // A batch timeout may cancel read_until after it appended partial bytes.
        let mut record_bytes = Vec::new();
        let mut batch = Vec::with_capacity(BATCH_MAX_LINES);
        let mut batch_deadline: Option<tokio::time::Instant> = None;

        let (reason, read_error) = loop {
            let next_record = if let Some(deadline) = batch_deadline {
                let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
                tokio::time::timeout(
                    remaining,
                    read_logcat_record(&mut reader, &mut record_bytes),
                )
                .await
                .ok()
            } else {
                Some(read_logcat_record(&mut reader, &mut record_bytes).await)
            };

            match next_record {
                Some(Ok(Some(line))) => {
                    // Anchor the deadline to the first line instead of resetting it per line.
                    if batch.is_empty() {
                        batch_deadline = Some(tokio::time::Instant::now() + BATCH_FLUSH_INTERVAL);
                    }
                    batch.push(parse_logcat_line(&line));

                    if should_flush_batch(batch.len(), None) {
                        emit_logcat_batch(&app_clone, &reader_serial, session_id, &mut batch);
                        batch_deadline = None;
                    }
                }
                Some(Ok(None)) => {
                    emit_logcat_batch(&app_clone, &reader_serial, session_id, &mut batch);
                    break ("eof", None);
                }
                Some(Err(err)) => {
                    emit_logcat_batch(&app_clone, &reader_serial, session_id, &mut batch);
                    break ("error", Some(err.to_string()));
                }
                None => {
                    if should_flush_batch(batch.len(), Some(BATCH_FLUSH_INTERVAL)) {
                        emit_logcat_batch(&app_clone, &reader_serial, session_id, &mut batch);
                    }
                    batch_deadline = None;
                }
            }
        };

        let finished_session = {
            let mut sessions = LOGCAT_SESSIONS.lock().await;
            if session_matches(
                sessions
                    .get(&reader_serial)
                    .map(|session| session.session_id),
                session_id,
            ) {
                sessions.remove(&reader_serial)
            } else {
                None
            }
        };
        if let Some(session) = finished_session {
            if let Err(error) = stop_logcat_session(session).await {
                eprintln!("failed to clean up finished Logcat process: {error}");
            }
        }

        let _ = tokio::time::timeout(STDERR_JOIN_TIMEOUT, stderr_task).await;
        let stderr_detail = {
            let tail = stderr_tail.lock().await;
            String::from_utf8_lossy(&tail).trim().to_string()
        };
        let detail = build_exit_detail(read_error.as_deref(), &stderr_detail);

        if let Err(err) = app_clone.emit(
            "logcat-exit",
            LogcatExit {
                serial: reader_serial,
                session_id,
                reason: reason.to_string(),
                detail,
            },
        ) {
            eprintln!("failed to emit logcat exit: {err}");
        }
    });

    Ok(LogcatSessionInfo { serial, session_id })
}

fn append_stderr_tail(tail: &mut Vec<u8>, bytes: &[u8]) {
    tail.extend_from_slice(bytes);
    if tail.len() <= STDERR_TAIL_MAX_BYTES {
        return;
    }

    let mut start = tail.len() - STDERR_TAIL_MAX_BYTES;
    while start < tail.len() && tail[start] & 0b1100_0000 == 0b1000_0000 {
        start += 1;
    }
    tail.drain(..start);
}

fn emit_logcat_batch(app: &AppHandle, serial: &str, session_id: u64, batch: &mut Vec<LogcatLine>) {
    if batch.is_empty() {
        return;
    }

    let lines = std::mem::replace(batch, Vec::with_capacity(BATCH_MAX_LINES));
    if let Err(err) = app.emit(
        "logcat-batch",
        LogcatBatch {
            serial: serial.to_string(),
            session_id,
            lines,
        },
    ) {
        eprintln!("failed to emit logcat batch: {err}");
    }
}

fn parse_logcat_line(raw: &str) -> LogcatLine {
    if let Some(caps) = THREADTIME_RE.captures(raw) {
        LogcatLine {
            time: caps
                .get(1)
                .map(|m| m.as_str().to_string())
                .unwrap_or_default(),
            pid: caps
                .get(2)
                .map(|m| m.as_str().to_string())
                .unwrap_or_default(),
            tid: caps
                .get(3)
                .map(|m| m.as_str().to_string())
                .unwrap_or_default(),
            level: caps
                .get(4)
                .map(|m| m.as_str().to_string())
                .unwrap_or_default(),
            tag: caps
                .get(5)
                .map(|m| m.as_str().trim().to_string())
                .unwrap_or_default(),
            message: caps
                .get(6)
                .map(|m| m.as_str().to_string())
                .unwrap_or_default(),
            raw: raw.to_string(),
        }
    } else {
        LogcatLine {
            time: "".to_string(),
            level: "I".to_string(),
            tag: "".to_string(),
            pid: "".to_string(),
            tid: "".to_string(),
            message: raw.to_string(),
            raw: raw.to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{
        append_stderr_tail, build_exit_detail, decode_logcat_record, drain_session_values,
        is_pidof_no_process, logcat_start_lock, next_process_ps_attempt, parse_logcat_line,
        parse_process_table, read_logcat_record, session_matches, should_flush_batch,
        start_after_stopping, stop_all_sessions, ProcessEntry, ProcessPsAttempt,
        BATCH_FLUSH_INTERVAL, BATCH_MAX_LINES, STDERR_TAIL_MAX_BYTES,
    };
    use std::collections::HashMap;
    use std::sync::{Arc, Mutex};
    use std::time::Duration;

    #[test]
    fn batch_flushes_at_line_or_fixed_time_limit() {
        assert!(!should_flush_batch(0, Some(BATCH_FLUSH_INTERVAL)));
        assert!(!should_flush_batch(
            1,
            Some(BATCH_FLUSH_INTERVAL - Duration::from_millis(1))
        ));
        assert!(should_flush_batch(1, Some(BATCH_FLUSH_INTERVAL)));
        assert!(!should_flush_batch(BATCH_MAX_LINES - 1, None));
        assert!(should_flush_batch(BATCH_MAX_LINES, None));
        assert_eq!(BATCH_FLUSH_INTERVAL, Duration::from_millis(50));
    }

    #[test]
    fn pidof_only_treats_an_empty_exit_one_as_no_process() {
        assert!(is_pidof_no_process(Some(1), b"", b""));
        assert!(is_pidof_no_process(Some(1), b"\n", b" \n"));
        assert!(!is_pidof_no_process(Some(0), b"", b""));
        assert!(!is_pidof_no_process(Some(1), b"diagnostic", b""));
        assert!(!is_pidof_no_process(Some(1), b"", b"device offline"));
        assert!(!is_pidof_no_process(Some(2), b"", b""));
        assert!(!is_pidof_no_process(None, b"", b""));
    }

    #[test]
    fn parses_formatted_process_table_with_crlf_blank_lines_and_full_names() {
        let entries = parse_process_table(
            "\r\n  PID NAME\r\n123 com.example.app:remote\r\n124 [kworker/0:1]\r\n\r\n",
        )
        .unwrap();

        assert_eq!(
            entries,
            vec![
                ProcessEntry {
                    pid: "123".to_string(),
                    name: "com.example.app:remote".to_string(),
                },
                ProcessEntry {
                    pid: "124".to_string(),
                    name: "[kworker/0:1]".to_string(),
                },
            ]
        );
    }

    #[test]
    fn parses_reordered_columns_without_treating_numeric_uid_as_pid() {
        let entries = parse_process_table(
            "UID NAME PID PPID\n1000 system_server 234 1\n10123 com.example.app 456 1\n",
        )
        .unwrap();

        assert_eq!(
            entries,
            vec![
                ProcessEntry {
                    pid: "234".to_string(),
                    name: "system_server".to_string(),
                },
                ProcessEntry {
                    pid: "456".to_string(),
                    name: "com.example.app".to_string(),
                },
            ]
        );
    }

    #[test]
    fn accepts_cmd_and_command_header_aliases() {
        assert_eq!(
            parse_process_table("PID CMD\n12 surfaceflinger\n").unwrap(),
            vec![ProcessEntry {
                pid: "12".to_string(),
                name: "surfaceflinger".to_string(),
            }]
        );
        assert_eq!(
            parse_process_table("COMMAND USER PID\nzygote root 34\n").unwrap(),
            vec![ProcessEntry {
                pid: "34".to_string(),
                name: "zygote".to_string(),
            }]
        );
    }

    #[test]
    fn skips_malformed_process_rows_and_rejects_headerless_output() {
        let entries = parse_process_table(
            "UID PID NAME\n1000 not-a-pid wrong\n1001 321\n1002 456 valid.process\n",
        )
        .unwrap();

        assert_eq!(
            entries,
            vec![ProcessEntry {
                pid: "456".to_string(),
                name: "valid.process".to_string(),
            }]
        );
        assert!(parse_process_table("1000 123 com.example.app\n").is_err());
    }

    #[test]
    fn retries_only_for_the_option_rejected_by_ps() {
        assert_eq!(
            next_process_ps_attempt(
                ProcessPsAttempt::Formatted,
                Some(1),
                b"",
                b"ps: bad -o 'PID,NAME'\r\n"
            ),
            Some(ProcessPsAttempt::All)
        );
        assert_eq!(
            next_process_ps_attempt(
                ProcessPsAttempt::All,
                Some(1),
                b"ps: invalid option -- 'A'\n",
                b""
            ),
            Some(ProcessPsAttempt::Plain)
        );
        assert_eq!(
            next_process_ps_attempt(
                ProcessPsAttempt::Formatted,
                Some(1),
                b"",
                b"ps: invalid option -- 'A'\n"
            ),
            Some(ProcessPsAttempt::Plain)
        );
        assert_eq!(
            next_process_ps_attempt(
                ProcessPsAttempt::Plain,
                Some(1),
                b"",
                b"ps: unknown option o\n"
            ),
            None
        );
    }

    #[test]
    fn adb_and_non_option_failures_never_trigger_ps_fallback() {
        for diagnostic in [
            "error: device offline",
            "error: device unauthorized. Please check the confirmation dialog on your device.",
            "adb: more than one device with serial emulator-5554",
            "error: device 'emulator-5554' not found",
            "error: transport is closing",
            "ps: permission denied",
            "ps: invalid option -- 'x'",
        ] {
            assert_eq!(
                next_process_ps_attempt(
                    ProcessPsAttempt::Formatted,
                    Some(1),
                    b"",
                    diagnostic.as_bytes()
                ),
                None,
                "unexpected fallback for {diagnostic}"
            );
        }
        assert_eq!(
            next_process_ps_attempt(
                ProcessPsAttempt::Formatted,
                Some(0),
                b"",
                b"ps: unknown option o\n"
            ),
            None
        );
        assert_eq!(
            next_process_ps_attempt(
                ProcessPsAttempt::Formatted,
                None,
                b"",
                b"ps: unknown option o\n"
            ),
            None
        );
    }

    #[tokio::test]
    async fn same_serial_starts_share_a_lock_without_blocking_other_devices() {
        let first = logcat_start_lock("restart-device").await;
        let second = logcat_start_lock("restart-device").await;
        let other = logcat_start_lock("other-device").await;

        assert!(Arc::ptr_eq(&first, &second));
        assert!(!Arc::ptr_eq(&first, &other));
        let _guard = first.lock().await;
        assert!(second.try_lock().is_err());
        assert!(other.try_lock().is_ok());
    }

    #[tokio::test]
    async fn replacement_stops_the_old_child_before_starting_and_aborts_on_stop_failure() {
        let events = Arc::new(Mutex::new(Vec::new()));
        let stop_events = Arc::clone(&events);
        let start_events = Arc::clone(&events);
        let started = start_after_stopping(
            Some(7_u64),
            move |session_id| async move {
                stop_events
                    .lock()
                    .unwrap()
                    .push(format!("stop-{session_id}"));
                Ok(())
            },
            move || {
                start_events.lock().unwrap().push("start".to_string());
                Ok(9_u64)
            },
        )
        .await;

        assert_eq!(started, Ok(9));
        assert_eq!(*events.lock().unwrap(), vec!["stop-7", "start"]);

        let start_attempted = Arc::new(Mutex::new(false));
        let start_attempted_by_closure = Arc::clone(&start_attempted);
        let failed = start_after_stopping(
            Some(()),
            |_| async { Err("old child is still running".to_string()) },
            move || {
                *start_attempted_by_closure.lock().unwrap() = true;
                Ok(())
            },
        )
        .await;

        assert_eq!(failed, Err("old child is still running".to_string()));
        assert!(!*start_attempted.lock().unwrap());
    }

    #[test]
    fn session_match_requires_the_exact_id() {
        assert!(!session_matches(None, 2));
        assert!(!session_matches(Some(1), 2));
        assert!(session_matches(Some(2), 2));
        assert!(!session_matches(Some(3), 2));
    }

    #[test]
    fn draining_sessions_returns_every_value_and_empties_the_map() {
        let mut sessions = HashMap::from([
            ("device-a".to_string(), 10_u64),
            ("device-b".to_string(), 20_u64),
        ]);

        let mut drained = drain_session_values(&mut sessions);
        drained.sort_unstable();

        assert_eq!(drained, vec![10, 20]);
        assert!(sessions.is_empty());
    }

    #[tokio::test]
    async fn stopping_all_sessions_attempts_every_item_and_reports_failures() {
        let attempts = Arc::new(Mutex::new(Vec::new()));
        let recorded_attempts = Arc::clone(&attempts);

        let result = stop_all_sessions(vec![10_u64, 20, 30], move |session_id| {
            let recorded_attempts = Arc::clone(&recorded_attempts);
            async move {
                recorded_attempts.lock().unwrap().push(session_id);
                if session_id == 20 {
                    Err("session 20 failed".to_string())
                } else {
                    Ok(())
                }
            }
        })
        .await;

        assert_eq!(*attempts.lock().unwrap(), vec![10, 20, 30]);
        assert_eq!(
            result,
            Err("Failed to stop 1 of 3 Logcat sessions: session 20 failed".to_string())
        );
    }

    #[test]
    fn exit_detail_is_always_non_empty_and_preserves_diagnostics() {
        assert_eq!(
            build_exit_detail(None, ""),
            "Logcat process exited (stdout EOF)"
        );
        assert_eq!(build_exit_detail(None, "device offline"), "device offline");
        assert_eq!(build_exit_detail(Some("read failed"), ""), "read failed");
        assert_eq!(
            build_exit_detail(Some("read failed"), "device offline"),
            "read failed\ndevice offline"
        );
    }

    #[tokio::test]
    async fn byte_framing_replaces_invalid_utf8_without_stopping_the_stream() {
        let mut input = b"first ".to_vec();
        input.push(0xff);
        input.extend_from_slice(b" record\nsecond record\n");
        let mut reader = std::io::Cursor::new(input);
        let mut record_bytes = Vec::new();

        assert_eq!(
            read_logcat_record(&mut reader, &mut record_bytes)
                .await
                .unwrap(),
            Some("first \u{fffd} record".to_string())
        );
        assert_eq!(
            read_logcat_record(&mut reader, &mut record_bytes)
                .await
                .unwrap(),
            Some("second record".to_string())
        );
        assert_eq!(
            read_logcat_record(&mut reader, &mut record_bytes)
                .await
                .unwrap(),
            None
        );
    }

    #[test]
    fn decoding_removes_only_the_line_ending_and_preserves_whitespace() {
        assert_eq!(
            decode_logcat_record(b"\t  at frame  \r\n"),
            "\t  at frame  "
        );
        assert_eq!(decode_logcat_record(b"  message  \n"), "  message  ");
        assert_eq!(decode_logcat_record(b"unfinished\r"), "unfinished\r");
    }

    #[tokio::test]
    async fn byte_framing_continues_a_partially_buffered_record() {
        let mut reader = std::io::Cursor::new(b"record\r\n".as_slice());
        let mut record_bytes = b"partial ".to_vec();

        assert_eq!(
            read_logcat_record(&mut reader, &mut record_bytes)
                .await
                .unwrap(),
            Some("partial record".to_string())
        );
    }

    #[test]
    fn stderr_tail_does_not_start_inside_utf8_character() {
        let mut input = vec![b'x'];
        input.extend_from_slice(&[0xe4, 0xb8, 0xad]);
        input.extend_from_slice(&[b'y'; STDERR_TAIL_MAX_BYTES - 2]);

        let mut tail = Vec::new();
        append_stderr_tail(&mut tail, &input);

        assert!(tail.len() <= STDERR_TAIL_MAX_BYTES);
        assert!(std::str::from_utf8(&tail).is_ok());
        assert!(tail.iter().all(|byte| *byte == b'y'));
    }

    #[test]
    fn parses_standard_threadtime_line() {
        let line = parse_logcat_line("07-26 14:23:45.123  1234  5678 D MyTag   : hello world");

        assert_eq!(line.time, "07-26 14:23:45.123");
        assert_eq!(line.pid, "1234");
        assert_eq!(line.tid, "5678");
        assert_eq!(line.level, "D");
        assert_eq!(line.tag, "MyTag");
        assert_eq!(line.message, "hello world");
        assert_eq!(
            line.raw,
            "07-26 14:23:45.123  1234  5678 D MyTag   : hello world"
        );
    }

    #[test]
    fn keeps_colons_inside_message() {
        let line = parse_logcat_line(
            "07-26 14:23:45.123  1234  5678 E AndroidRuntime: FATAL EXCEPTION: main",
        );

        assert_eq!(line.level, "E");
        assert_eq!(line.tag, "AndroidRuntime");
        assert_eq!(line.message, "FATAL EXCEPTION: main");
    }

    #[test]
    fn tag_containing_colon_splits_at_first_colon() {
        // Lazy matching stops at the first colon, so a tag that itself
        // contains a colon loses its suffix into the message. This is a
        // documented, acceptable limitation (such tags are extremely rare).
        let line = parse_logcat_line("07-26 14:23:45.123   123   456 W Tag.With:Colon: msg");

        assert_eq!(line.level, "W");
        assert_eq!(line.tag, "Tag.With");
        assert_eq!(line.message, "Colon: msg");
    }

    #[test]
    fn separator_line_falls_back_with_empty_time() {
        let line = parse_logcat_line("--------- beginning of main");

        assert_eq!(line.time, "");
        assert_eq!(line.level, "I");
        assert_eq!(line.tag, "");
        assert_eq!(line.pid, "");
        assert_eq!(line.tid, "");
        assert_eq!(line.message, "--------- beginning of main");
        assert_eq!(line.raw, "--------- beginning of main");
    }

    #[test]
    fn parses_empty_message() {
        // threadtime pads with "TAG     : " - trailing space, empty message.
        let line = parse_logcat_line("07-26 14:23:45.123  1234  5678 D MyTag   : ");
        assert_eq!(line.tag, "MyTag");
        assert_eq!(line.message, "");

        // Also without the trailing separator space.
        let line = parse_logcat_line("07-26 14:23:45.123  1234  5678 D MyTag   :");
        assert_eq!(line.tag, "MyTag");
        assert_eq!(line.message, "");
    }

    #[test]
    fn preserves_message_indentation_beyond_separator_space() {
        // Only the single separator space after the colon is stripped;
        // extra leading whitespace belongs to the message (stack traces).
        let line = parse_logcat_line(
            "07-26 14:23:45.123  1234  5678 E AndroidRuntime: \tat com.example.Main.run(Main.java:1)",
        );

        assert_eq!(line.tag, "AndroidRuntime");
        assert_eq!(line.message, "\tat com.example.Main.run(Main.java:1)");
    }
}

#[tauri::command]
pub async fn stop_logcat(serial: String, session_id: u64) -> Result<(), String> {
    let session = {
        let mut sessions = LOGCAT_SESSIONS.lock().await;
        if session_matches(
            sessions.get(&serial).map(|session| session.session_id),
            session_id,
        ) {
            sessions.remove(&serial)
        } else {
            None
        }
    };

    if let Some(session) = session {
        stop_logcat_session(session).await?;
    }
    Ok(())
}

fn logcat_dir() -> PathBuf {
    if let Some(dir) = dirs::document_dir() {
        dir.join("ADB GUI").join("logs")
    } else {
        PathBuf::from("/tmp/ADB GUI/logs")
    }
}
