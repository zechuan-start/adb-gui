use std::sync::LazyLock;
use tokio::sync::Mutex;
use tauri::{AppHandle, Emitter};
use tokio::process::Command;
use tokio::io::{AsyncBufReadExt, BufReader};

use crate::adb;

static LOGCAT_CHILD: LazyLock<Mutex<Option<tokio::process::Child>>> = LazyLock::new(|| Mutex::new(None));

#[derive(serde::Serialize, Clone)]
pub struct LogcatLine {
    pub level: String,
    pub tag: String,
    pub pid: String,
    pub message: String,
    pub raw: String,
}

#[tauri::command]
pub async fn start_logcat(app: AppHandle, serial: String) -> Result<(), String> {
    let adb_path = adb::resolve_adb_path(&app)?;

    let mut child = Command::new(&adb_path)
        .arg("-s")
        .arg(&serial)
        .arg("logcat")
        .arg("-v")
        .arg("brief")
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to start logcat: {e}"))?;

    let stdout = child.stdout.take().ok_or("Failed to capture logcat stdout")?;

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
            let parsed = parse_logcat_line(&line);
            let _ = app_clone.emit("logcat-line", &parsed);
        }
    });

    Ok(())
}

fn parse_logcat_line(raw: &str) -> LogcatLine {
    let re = regex::Regex::new(r"^([VDIWEF])/(.+?)\s*\(\s*(\d+)\): (.*)$").unwrap();
    if let Some(caps) = re.captures(raw) {
        LogcatLine {
            level: caps.get(1).map(|m| m.as_str().to_string()).unwrap_or_default(),
            tag: caps.get(2).map(|m| m.as_str().trim().to_string()).unwrap_or_default(),
            pid: caps.get(3).map(|m| m.as_str().to_string()).unwrap_or_default(),
            message: caps.get(4).map(|m| m.as_str().to_string()).unwrap_or_default(),
            raw: raw.to_string(),
        }
    } else {
        LogcatLine {
            level: "I".to_string(),
            tag: "".to_string(),
            pid: "".to_string(),
            message: raw.to_string(),
            raw: raw.to_string(),
        }
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
