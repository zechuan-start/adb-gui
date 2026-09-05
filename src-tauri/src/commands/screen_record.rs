use serde::{Deserialize, Serialize};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Child, Stdio};
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, Instant};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

use super::capture_behavior::{after_save, SaveBehavior};
use super::capture_output::{capture_id, capture_target, CaptureDestination, CaptureOutput};
use super::device::{
    adb_output_error, run_adb_bytes_with_serial, run_adb_output_with_serial, run_adb_with_serial,
};
use super::device_files::{remote_file_size, shell_quote};
use crate::adb;

const SCREEN_RECORD_LIMIT_SECS: u64 = 180;
static RECORDING: LazyLock<Mutex<RecorderState>> =
    LazyLock::new(|| Mutex::new(RecorderState::Idle));

enum RecorderState {
    Idle,
    Session(RecordingSession),
    Busy(ScreenRecordStatus),
}

struct RecordingSession {
    id: String,
    serial: String,
    remote_path: String,
    local_path: PathBuf,
    child: Child,
    started_at: Instant,
    stopped_at: Option<Instant>,
    phase: RecordPhase,
    error: Option<String>,
    attempted_path: Option<String>,
}

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RecordPhase {
    Idle,
    Recording,
    PendingSave,
    Saving,
    SaveFailed,
}

#[derive(Serialize, Clone)]
pub struct ScreenRecordStatus {
    pub phase: RecordPhase,
    pub session_id: Option<String>,
    pub serial: Option<String>,
    pub elapsed_secs: u64,
    pub local_path: Option<String>,
    pub remote_path: Option<String>,
    pub error: Option<String>,
    pub attempted_path: Option<String>,
}

#[derive(Serialize, Clone)]
pub struct ScreenRecordResult {
    pub path: String,
    pub opened: bool,
    pub source_cleanup_error: Option<String>,
    pub remote_path: String,
    pub serial: String,
}

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum RecordingSaveTarget {
    Session,
    File { path: String },
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveRecordingRequest {
    session_id: String,
    behavior: SaveBehavior,
    target: RecordingSaveTarget,
}

#[derive(Serialize)]
pub struct DiscardRecordingResult {
    pub serial: String,
    pub remote_path: String,
    pub source_cleanup_error: Option<String>,
}

impl RecordingSession {
    fn status(&self) -> ScreenRecordStatus {
        ScreenRecordStatus {
            phase: self.phase.clone(),
            session_id: Some(self.id.clone()),
            serial: Some(self.serial.clone()),
            elapsed_secs: self
                .stopped_at
                .unwrap_or_else(Instant::now)
                .saturating_duration_since(self.started_at)
                .as_secs()
                .min(SCREEN_RECORD_LIMIT_SECS),
            local_path: Some(self.local_path.to_string_lossy().into_owned()),
            remote_path: Some(self.remote_path.clone()),
            error: self.error.clone(),
            attempted_path: self.attempted_path.clone(),
        }
    }
}

fn idle_status() -> ScreenRecordStatus {
    ScreenRecordStatus {
        phase: RecordPhase::Idle,
        session_id: None,
        serial: None,
        elapsed_secs: 0,
        local_path: None,
        remote_path: None,
        error: None,
        attempted_path: None,
    }
}

fn require_idle(state: &RecorderState) -> Result<(), String> {
    if matches!(state, RecorderState::Idle) {
        Ok(())
    } else {
        Err("已有录屏或待恢复文件, 请先保存或放弃当前录屏".to_string())
    }
}

fn take_session(state: &mut RecorderState, id: &str) -> Result<RecordingSession, String> {
    let status = match state {
        RecorderState::Session(session) if session.id == id => session.status(),
        RecorderState::Busy(_) => return Err("当前录屏操作尚未完成".to_string()),
        _ => return Err("录屏会话已变化, 操作已取消".to_string()),
    };
    let busy = ScreenRecordStatus {
        phase: RecordPhase::Saving,
        ..status
    };
    match std::mem::replace(state, RecorderState::Busy(busy)) {
        RecorderState::Session(session) => Ok(session),
        _ => unreachable!("session was checked while holding the recorder lock"),
    }
}

#[tauri::command]
pub async fn start_screen_record(
    app: AppHandle,
    serial: String,
    destination: CaptureDestination,
) -> Result<ScreenRecordStatus, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut state = RECORDING
            .lock()
            .map_err(|error| format!("读取录屏会话失败: {error}"))?;
        require_idle(&state)?;
        let adb_path = adb::resolve_adb_path(&app)?;
        let id = capture_id()?;
        let remote_path = format!("/sdcard/adb_gui_{id}.mp4");
        let local_path = capture_target(&destination, &serial, &id, "mp4")?;
        let child = adb::prepare_command(&app, &adb_path)
            .args([
                "-s",
                &serial,
                "shell",
                "-T",
                "screenrecord",
                "--bugreport",
                "--time-limit",
                &SCREEN_RECORD_LIMIT_SECS.to_string(),
                &remote_path,
            ])
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|error| format!("启动设备录屏失败: {error}"))?;
        let session = RecordingSession {
            id,
            serial,
            remote_path,
            local_path,
            child,
            started_at: Instant::now(),
            stopped_at: None,
            phase: RecordPhase::Recording,
            error: None,
            attempted_path: None,
        };
        let status = session.status();
        *state = RecorderState::Session(session);
        Ok(status)
    })
    .await
    .map_err(|error| format!("启动录屏任务失败: {error}"))?
}

#[tauri::command]
pub async fn stop_screen_record(
    app: AppHandle,
    request: SaveRecordingRequest,
) -> Result<ScreenRecordResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut session = take_session(
            &mut *RECORDING
                .lock()
                .map_err(|error| format!("读取录屏会话失败: {error}"))?,
            &request.session_id,
        )?;
        let (target, overwrite) = match request.target {
            RecordingSaveTarget::Session => (session.local_path.clone(), false),
            RecordingSaveTarget::File { path } => (PathBuf::from(path), true),
        };
        session.attempted_path = Some(target.to_string_lossy().into_owned());
        let result: Result<ScreenRecordResult, String> = (|| {
            stop_child(&app, &mut session)?;
            let source_cleanup_error = save_video_with(
                &target,
                overwrite,
                || remote_file_size(&app, &session.serial, &session.remote_path),
                |temporary| {
                    run_adb_with_serial(
                        &app,
                        &session.serial,
                        &["pull", &session.remote_path, &temporary.to_string_lossy()],
                    )
                    .map(|_| ())
                    .map_err(|error| {
                        format!(
                            "拉取设备录屏失败 ({} -> {}): {error}",
                            session.remote_path,
                            target.display()
                        )
                    })
                },
                || remove_source(&app, &session),
            )?;
            let path = target.to_string_lossy().into_owned();
            let opened = after_save(request.behavior.open_after_save, || {
                app.opener().open_path(&path, None::<&str>)
            });
            Ok(ScreenRecordResult {
                path,
                opened,
                source_cleanup_error,
                remote_path: session.remote_path.clone(),
                serial: session.serial.clone(),
            })
        })();
        let mut state = RECORDING
            .lock()
            .map_err(|error| format!("更新录屏会话失败: {error}"))?;
        *state = match &result {
            Ok(_) => RecorderState::Idle,
            Err(error) => {
                session.phase = RecordPhase::SaveFailed;
                session.error = Some(error.to_string());
                RecorderState::Session(session)
            }
        };
        result
    })
    .await
    .map_err(|error| format!("保存录屏任务失败: {error}"))?
}

fn save_video_with(
    target: &Path,
    overwrite: bool,
    source_size: impl FnOnce() -> Result<u64, String>,
    pull: impl FnOnce(&Path) -> Result<(), String>,
    cleanup: impl FnOnce() -> Result<(), String>,
) -> Result<Option<String>, String> {
    let expected = source_size()
        .map_err(|error| format!("检查设备源文件失败 ({}): {error}", target.display()))?;
    if expected == 0 {
        return Err("设备录屏文件为空, 保留源文件以便检查".to_string());
    }
    let output = CaptureOutput::new(target)?;
    pull(output.path())?;
    output.verify_size(expected)?;
    output.publish(overwrite)?;
    Ok(cleanup().err())
}

#[tauri::command]
pub async fn discard_screen_record(
    app: AppHandle,
    session_id: String,
) -> Result<DiscardRecordingResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut session = take_session(
            &mut *RECORDING
                .lock()
                .map_err(|error| format!("读取录屏会话失败: {error}"))?,
            &session_id,
        )?;
        let mut errors = Vec::new();
        if let Err(error) = stop_child(&app, &mut session) {
            errors.push(error);
            if let Err(error) = session.child.kill() {
                errors.push(format!("结束本机录屏连接失败: {error}"));
            }
            if let Err(error) = session.child.wait() {
                errors.push(format!("回收本机录屏连接失败: {error}"));
            }
        }
        if let Err(error) = remove_source(&app, &session) {
            errors.push(error);
        }
        let source_cleanup_error = if errors.is_empty() {
            None
        } else {
            Some(errors.join("; "))
        };
        let result = DiscardRecordingResult {
            serial: session.serial,
            remote_path: session.remote_path,
            source_cleanup_error,
        };
        *RECORDING
            .lock()
            .map_err(|error| format!("释放录屏会话失败: {error}"))? = RecorderState::Idle;
        Ok(result)
    })
    .await
    .map_err(|error| format!("放弃录屏任务失败: {error}"))?
}

#[tauri::command]
pub fn get_screen_record_status() -> Result<ScreenRecordStatus, String> {
    let mut state = RECORDING
        .lock()
        .map_err(|error| format!("读取录屏会话失败: {error}"))?;
    match &mut *state {
        RecorderState::Idle => Ok(idle_status()),
        RecorderState::Busy(status) => Ok(status.clone()),
        RecorderState::Session(session) => {
            if session.phase == RecordPhase::Recording {
                if let Some(exit) = session
                    .child
                    .try_wait()
                    .map_err(|error| format!("检查录屏进程失败: {error}"))?
                {
                    session.stopped_at.get_or_insert_with(Instant::now);
                    if exit.success() {
                        session.phase = RecordPhase::PendingSave;
                    } else {
                        let mut bytes = Vec::new();
                        if let Some(stderr) = session.child.stderr.take() {
                            stderr
                                .take(8192)
                                .read_to_end(&mut bytes)
                                .map_err(|error| format!("读取录屏错误失败: {error}"))?;
                        }
                        session.phase = RecordPhase::SaveFailed;
                        session.error = Some(format!(
                            "设备录屏进程失败 ({exit}): {}",
                            String::from_utf8_lossy(&bytes).trim()
                        ));
                    }
                }
            }
            Ok(session.status())
        }
    }
}

fn stop_child(app: &AppHandle, session: &mut RecordingSession) -> Result<(), String> {
    // A disconnected local adb child can exit while Android is still writing the file.
    let pids = signal_screenrecord(app, session)?;
    let started = Instant::now();
    while started.elapsed() < Duration::from_secs(5) {
        let local_stopped = session
            .child
            .try_wait()
            .map_err(|error| format!("等待录屏停止失败: {error}"))?
            .is_some();
        let mut remote_stopped = true;
        for pid in &pids {
            if remote_process_exists(app, &session.serial, pid)? {
                remote_stopped = false;
            }
        }
        if local_stopped && remote_stopped {
            session.stopped_at.get_or_insert_with(Instant::now);
            return Ok(());
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    Err(format!(
        "停止设备录屏超时, 源文件仍保留: {}",
        session.remote_path
    ))
}

fn signal_screenrecord(app: &AppHandle, session: &RecordingSession) -> Result<Vec<String>, String> {
    let output = run_adb_output_with_serial(
        app,
        &session.serial,
        &["shell", "-T", "pidof", "screenrecord"],
    )?;
    if !(output.status.success() || output.status.code() == Some(1) && output.stderr.is_empty()) {
        return Err(format!(
            "查询设备录屏进程失败: {}",
            adb_output_error(&output)
        ));
    }
    let mut matched = Vec::new();
    for pid in String::from_utf8_lossy(&output.stdout).split_whitespace() {
        if !pid.bytes().all(|byte| byte.is_ascii_digit()) {
            return Err("设备录屏 PID 无效".to_string());
        }
        let path = format!("/proc/{pid}/cmdline");
        let args = run_adb_bytes_with_serial(app, &session.serial, &["shell", "-T", "cat", &path])?;
        if command_belongs_to_session(&args, &session.remote_path) {
            run_adb_with_serial(app, &session.serial, &["shell", "-T", "kill", "-2", pid])
                .map_err(|error| format!("停止设备录屏失败: {error}"))?;
            matched.push(pid.to_string());
        }
    }
    Ok(matched)
}

fn remote_process_exists(app: &AppHandle, serial: &str, pid: &str) -> Result<bool, String> {
    let output = run_adb_output_with_serial(
        app,
        serial,
        &["shell", "-T", "test", "-d", &format!("/proc/{pid}")],
    )?;
    if output.status.success() {
        return Ok(true);
    }
    if output.status.code() == Some(1) && output.stderr.is_empty() {
        return Ok(false);
    }
    Err(format!(
        "确认设备录屏停止失败: {}",
        adb_output_error(&output)
    ))
}

fn command_belongs_to_session(args: &[u8], remote_path: &str) -> bool {
    args.split(|byte| *byte == 0)
        .any(|arg| arg == remote_path.as_bytes())
}

fn remove_source(app: &AppHandle, session: &RecordingSession) -> Result<(), String> {
    run_adb_with_serial(
        app,
        &session.serial,
        &[
            "shell",
            "-T",
            &format!("rm -f {}", shell_quote(&session.remote_path)),
        ],
    )
    .map(|_| ())
    .map_err(|error| {
        format!(
            "设备源文件未清理 ({} / {}): {error}",
            session.serial, session.remote_path
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;
    use std::fs;

    #[test]
    fn preserves_source_on_each_save_failure_and_only_cleans_after_publication() {
        let root = tempfile::tempdir().unwrap();
        let target = root.path().join("video.mp4");
        for stage in ["source", "empty", "pull", "incomplete", "publish"] {
            let cleaned = Cell::new(false);
            if stage == "publish" {
                fs::write(&target, b"existing user file").unwrap();
            }
            let result = save_video_with(
                &target,
                false,
                || {
                    if stage == "source" {
                        Err("offline".into())
                    } else {
                        Ok(if stage == "empty" { 0 } else { 8 })
                    }
                },
                |path| {
                    fs::write(
                        path,
                        if stage == "incomplete" {
                            b"part".as_slice()
                        } else {
                            b"complete".as_slice()
                        },
                    )
                    .unwrap();
                    if stage == "pull" {
                        Err("pull failed".into())
                    } else {
                        Ok(())
                    }
                },
                || {
                    cleaned.set(true);
                    Ok(())
                },
            );
            assert!(result.is_err(), "{stage}");
            assert!(!cleaned.get(), "{stage}");
            if stage == "publish" {
                assert_eq!(fs::read(&target).unwrap(), b"existing user file");
                fs::remove_file(&target).unwrap();
            }
            assert_eq!(fs::read_dir(root.path()).unwrap().count(), 0);
        }
        let warning = save_video_with(
            &target,
            false,
            || Ok(8),
            |path| fs::write(path, b"complete").map_err(|error| error.to_string()),
            || {
                assert_eq!(fs::read(&target).unwrap(), b"complete");
                Err("device disconnected after save".into())
            },
        )
        .unwrap();
        assert_eq!(warning.as_deref(), Some("device disconnected after save"));
        assert_eq!(fs::read(&target).unwrap(), b"complete");
    }

    #[test]
    fn refuses_stale_and_concurrent_operations_without_releasing_session_ownership() {
        let mut child = std::process::Command::new(std::env::current_exe().unwrap())
            .arg("--list")
            .stdout(Stdio::null())
            .spawn()
            .unwrap();
        child.wait().unwrap();
        let session = RecordingSession {
            id: "one".into(),
            serial: "device-a".into(),
            remote_path: "/sdcard/one.mp4".into(),
            local_path: PathBuf::from("one.mp4"),
            child,
            started_at: Instant::now(),
            stopped_at: None,
            phase: RecordPhase::SaveFailed,
            error: Some("pull failed".into()),
            attempted_path: None,
        };
        let mut state = RecorderState::Session(session);
        assert!(require_idle(&state).is_err());
        assert!(take_session(&mut state, "old").is_err());
        let mut session = take_session(&mut state, "one").unwrap();
        session.stopped_at = Some(session.started_at + Duration::from_secs(3));
        assert_eq!(session.status().elapsed_secs, 3);
        assert!(take_session(&mut state, "one").is_err());
        assert!(require_idle(&state).is_err());
        session.error = Some("retry failed".into());
        state = RecorderState::Session(session);
        assert_eq!(take_session(&mut state, "one").unwrap().serial, "device-a");
    }

    #[test]
    fn never_signals_an_unrelated_recording_or_a_partial_path_match() {
        let args = b"screenrecord\0--bugreport\0/sdcard/one.mp4\0";
        assert!(command_belongs_to_session(args, "/sdcard/one.mp4"));
        assert!(!command_belongs_to_session(args, "/sdcard/one"));
        assert!(!command_belongs_to_session(args, "/sdcard/two.mp4"));
    }
}
