use std::path::PathBuf;
use std::sync::LazyLock;
use tauri::{AppHandle, Emitter};
use tauri_plugin_opener::OpenerExt;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::Mutex;

use super::device::run_adb_with_serial;
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

fn logcat_dir() -> PathBuf {
    if let Some(dir) = dirs::document_dir() {
        dir.join("ADB GUI").join("logs")
    } else {
        PathBuf::from("/tmp/ADB GUI/logs")
    }
}
