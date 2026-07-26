use std::path::PathBuf;
use std::sync::LazyLock;
use tauri::{AppHandle, Emitter};
use tauri_plugin_opener::OpenerExt;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::sync::Mutex;

use super::device::run_adb_with_serial;
use crate::adb;

const INITIAL_LOGCAT_LINES: &str = "5000";

static LOGCAT_CHILD: LazyLock<Mutex<Option<tokio::process::Child>>> =
    LazyLock::new(|| Mutex::new(None));

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
    pub serial: String,
    pub time: String,
    pub level: String,
    pub tag: String,
    pub pid: String,
    pub tid: String,
    pub message: String,
    pub raw: String,
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
    let output = run_adb_with_serial(&app, &serial, &["shell", "pidof", &pkg]).unwrap_or_default();
    Ok(output.split_whitespace().map(ToString::to_string).collect())
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
pub async fn start_logcat(app: AppHandle, serial: String) -> Result<(), String> {
    let adb_path = adb::resolve_adb_path(&app)?;

    let mut child = adb::prepare_async_command(&app, &adb_path)
        .arg("-s")
        .arg(&serial)
        .arg("logcat")
        .arg("-T")
        .arg(INITIAL_LOGCAT_LINES)
        .arg("-v")
        .arg("threadtime")
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to start logcat: {e}"))?;

    let stdout = child
        .stdout
        .take()
        .ok_or("Failed to capture logcat stdout")?;

    {
        let mut lock = LOGCAT_CHILD.lock().await;
        if let Some(mut existing) = lock.take() {
            let _ = existing.kill().await;
        }
        *lock = Some(child);
    }

    let app_clone = app.clone();

    tokio::spawn(async move {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();

        while let Ok(Some(line)) = lines.next_line().await {
            let parsed = parse_logcat_line(&serial, &line);
            let _ = app_clone.emit("logcat-line", &parsed);
        }
    });

    Ok(())
}

fn parse_logcat_line(serial: &str, raw: &str) -> LogcatLine {
    if let Some(caps) = THREADTIME_RE.captures(raw) {
        LogcatLine {
            serial: serial.to_string(),
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
            serial: serial.to_string(),
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
    use super::parse_logcat_line;

    #[test]
    fn parses_standard_threadtime_line() {
        let line = parse_logcat_line(
            "emulator-5554",
            "07-26 14:23:45.123  1234  5678 D MyTag   : hello world",
        );

        assert_eq!(line.serial, "emulator-5554");
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
            "s",
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
        let line = parse_logcat_line("s", "07-26 14:23:45.123   123   456 W Tag.With:Colon: msg");

        assert_eq!(line.level, "W");
        assert_eq!(line.tag, "Tag.With");
        assert_eq!(line.message, "Colon: msg");
    }

    #[test]
    fn separator_line_falls_back_with_empty_time() {
        let line = parse_logcat_line("s", "--------- beginning of main");

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
        let line = parse_logcat_line("s", "07-26 14:23:45.123  1234  5678 D MyTag   : ");
        assert_eq!(line.tag, "MyTag");
        assert_eq!(line.message, "");

        // Also without the trailing separator space.
        let line = parse_logcat_line("s", "07-26 14:23:45.123  1234  5678 D MyTag   :");
        assert_eq!(line.tag, "MyTag");
        assert_eq!(line.message, "");
    }

    #[test]
    fn preserves_message_indentation_beyond_separator_space() {
        // Only the single separator space after the colon is stripped;
        // extra leading whitespace belongs to the message (stack traces).
        let line = parse_logcat_line(
            "s",
            "07-26 14:23:45.123  1234  5678 E AndroidRuntime: \tat com.example.Main.run(Main.java:1)",
        );

        assert_eq!(line.tag, "AndroidRuntime");
        assert_eq!(line.message, "\tat com.example.Main.run(Main.java:1)");
    }
}

#[tauri::command]
pub async fn stop_logcat() -> Result<(), String> {
    let mut lock = LOGCAT_CHILD.lock().await;
    if let Some(mut child) = lock.take() {
        let _ = child.kill().await;
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
