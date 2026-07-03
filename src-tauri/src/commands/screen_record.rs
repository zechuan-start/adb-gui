use serde::Serialize;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, Instant};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

use super::device::run_adb_with_serial;
use crate::adb;

const SCREEN_RECORD_LIMIT_SECS: u64 = 180;

static RECORDING: LazyLock<Mutex<Option<RecordingSession>>> = LazyLock::new(|| Mutex::new(None));

struct RecordingSession {
    serial: String,
    remote_path: String,
    local_path: PathBuf,
    child: Child,
    started_at: Instant,
}

#[derive(Serialize, Clone)]
pub struct ScreenRecordStatus {
    pub active: bool,
    pub serial: Option<String>,
    pub elapsed_secs: u64,
    pub pending_pull: bool,
}

#[derive(Serialize, Clone)]
pub struct ScreenRecordResult {
    pub path: String,
    pub opened: bool,
}

#[tauri::command]
pub fn start_screen_record(app: AppHandle, serial: String) -> Result<ScreenRecordStatus, String> {
    let adb_path = adb::resolve_adb_path(&app)?;
    let timestamp = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();
    let remote_path = format!("/sdcard/adb_gui_{timestamp}.mp4");
    let save_dir = screenshot_dir();
    std::fs::create_dir_all(&save_dir).map_err(|e| format!("Failed to create dir: {e}"))?;
    let local_path = save_dir.join(format!("{}-{timestamp}.mp4", safe_serial(&serial)));

    let mut lock = RECORDING
        .lock()
        .map_err(|e| format!("Failed to lock screen recorder: {e}"))?;
    if let Some(existing) = lock.as_mut() {
        return if child_is_running(&mut existing.child)? {
            Err("已有录屏正在进行，请先停止当前录屏。".to_string())
        } else {
            Err("已有录屏已结束但尚未保存，请先停止录屏完成保存。".to_string())
        };
    }

    let child = Command::new(&adb_path)
        .arg("-s")
        .arg(&serial)
        .arg("shell")
        .arg("screenrecord")
        .arg("--bugreport")
        .arg("--time-limit")
        .arg(SCREEN_RECORD_LIMIT_SECS.to_string())
        .arg(&remote_path)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to start screenrecord: {e}"))?;

    *lock = Some(RecordingSession {
        serial: serial.clone(),
        remote_path,
        local_path,
        child,
        started_at: Instant::now(),
    });

    Ok(ScreenRecordStatus {
        active: true,
        serial: Some(serial),
        elapsed_secs: 0,
        pending_pull: false,
    })
}

#[tauri::command]
pub fn stop_screen_record(app: AppHandle) -> Result<ScreenRecordResult, String> {
    let session = {
        let mut lock = RECORDING
            .lock()
            .map_err(|e| format!("Failed to lock screen recorder: {e}"))?;
        lock.take()
    };
    let mut session = session.ok_or_else(|| "当前没有正在录制或待保存的录屏。".to_string())?;

    stop_child(&app, &mut session)?;

    let local_path_str = session.local_path.to_string_lossy().to_string();
    let pull_result = run_adb_with_serial(
        &app,
        &session.serial,
        &["pull", &session.remote_path, &local_path_str],
    );
    let cleanup_result = run_adb_with_serial(
        &app,
        &session.serial,
        &["shell", "rm", "-f", &session.remote_path],
    );

    if let Err(err) = cleanup_result {
        eprintln!("failed to cleanup remote screenrecord file: {err}");
    }

    pull_result.map_err(|e| format!("Failed to pull screen recording: {e}"))?;

    let size = std::fs::metadata(&session.local_path)
        .map_err(|e| format!("Failed to read screen recording file: {e}"))?
        .len();
    if size == 0 {
        let _ = std::fs::remove_file(&session.local_path);
        return Err("录屏文件为空，可能录制时间过短或设备端写入失败。".to_string());
    }

    let mut opened = false;
    if let Err(err) = app.opener().open_path(&local_path_str, None::<&str>) {
        eprintln!("failed to open screen recording: {err}");
    } else {
        opened = true;
    }

    Ok(ScreenRecordResult {
        path: local_path_str,
        opened,
    })
}

#[tauri::command]
pub fn get_screen_record_status() -> Result<ScreenRecordStatus, String> {
    let mut lock = RECORDING
        .lock()
        .map_err(|e| format!("Failed to lock screen recorder: {e}"))?;
    if let Some(session) = lock.as_mut() {
        let active = child_is_running(&mut session.child)?;
        Ok(ScreenRecordStatus {
            active,
            serial: Some(session.serial.clone()),
            elapsed_secs: session.started_at.elapsed().as_secs(),
            pending_pull: !active,
        })
    } else {
        Ok(ScreenRecordStatus {
            active: false,
            serial: None,
            elapsed_secs: 0,
            pending_pull: false,
        })
    }
}

fn child_is_running(child: &mut Child) -> Result<bool, String> {
    child
        .try_wait()
        .map(|status| status.is_none())
        .map_err(|e| format!("Failed to check screenrecord status: {e}"))
}

fn stop_child(app: &AppHandle, session: &mut RecordingSession) -> Result<(), String> {
    if child_is_running(&mut session.child)? {
        signal_screenrecord(app, &session.serial);
        wait_for_child_exit(&mut session.child, Duration::from_secs(3))?;
    }

    if child_is_running(&mut session.child)? {
        session
            .child
            .kill()
            .map_err(|e| format!("Failed to stop screenrecord: {e}"))?;
        session
            .child
            .wait()
            .map_err(|e| format!("Failed to wait for screenrecord: {e}"))?;
    }

    Ok(())
}

fn signal_screenrecord(app: &AppHandle, serial: &str) {
    let pid_output =
        run_adb_with_serial(app, serial, &["shell", "pidof", "screenrecord"]).unwrap_or_default();
    let pids: Vec<&str> = pid_output.split_whitespace().collect();
    if pids.is_empty() {
        let _ = run_adb_with_serial(app, serial, &["shell", "pkill", "-2", "screenrecord"]);
        return;
    }

    let mut args = vec!["shell", "kill", "-2"];
    args.extend(pids);
    let _ = run_adb_with_serial(app, serial, &args);
}

fn wait_for_child_exit(child: &mut Child, timeout: Duration) -> Result<(), String> {
    let started = Instant::now();
    while started.elapsed() < timeout {
        if !child_is_running(child)? {
            return Ok(());
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    Ok(())
}

fn screenshot_dir() -> PathBuf {
    if let Some(dir) = dirs::picture_dir() {
        dir.join("ADB GUI")
    } else {
        PathBuf::from("/tmp/ADB GUI")
    }
}

fn safe_serial(serial: &str) -> String {
    serial.replace(['/', ':', ' '], "_")
}

#[cfg(test)]
mod tests {
    use super::safe_serial;

    #[test]
    fn safe_serial_replaces_path_separators() {
        assert_eq!(safe_serial("192.168.1.2:5555"), "192.168.1.2_5555");
        assert_eq!(safe_serial("usb/device name"), "usb_device_name");
    }
}
