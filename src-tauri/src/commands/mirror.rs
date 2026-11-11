use crate::{adb, error::AppError, error_codes as codes};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::path::{Path, PathBuf};
use std::process::{ExitStatus, Output, Stdio};
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Arc, LazyLock, Mutex,
};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncRead, AsyncReadExt};
use tokio::process::{Child, Command};
use tokio::sync::{watch, Notify};

const MIN_VERSION: (u32, u32) = (2, 0);
const VERSION_TIMEOUT: Duration = Duration::from_secs(5);
const VERSION_EXCERPT_LINES: usize = 5;
const STDERR_MAX_LINES: usize = 40;
const STDERR_LINE_MAX_BYTES: usize = 512;
const FALLBACK_DETAIL_LINES: usize = 5;
const STDERR_JOIN_TIMEOUT: Duration = Duration::from_millis(250);
const TERMINATE_GRACE: Duration = Duration::from_secs(3);
const STOP_TIMEOUT: Duration = Duration::from_secs(5);
const SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(5);
const DISCONNECTED_EXIT_CODE: i32 = 2;
const MIRROR_EXIT_EVENT: &str = "mirror-exit";

// scrcpy parses argv with getopt_long, which accepts any unambiguous long
// option abbreviation (`--ser=X` selects a device like `--serial=X`) and
// bundled short flags (`-Sd`). The device is chosen by the application.
const FORBIDDEN_LONG_OPTIONS: [&str; 5] = ["serial", "select-usb", "select-tcpip", "tcpip", "otg"];
const FORBIDDEN_SHORT_OPTIONS: [char; 3] = ['s', 'd', 'e'];
// Short options whose value may follow in the same argument, as in `-m1024`.
const SHORT_OPTIONS_WITH_VALUE: [char; 6] = ['b', 'm', 'p', 'r', 's', 'V'];

static VERSION_RE: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r"^scrcpy ((\d+)\.(\d+)(?:\.\d+)?)").unwrap());
// macOS prefixes some scrcpy errors with an NSLog header:
// `2026-10-19 14:30:03.882 scrcpy[1234:5678] ERROR: ...`.
static ERROR_LINE_RE: LazyLock<regex::Regex> = LazyLock::new(|| {
    regex::Regex::new(r"^(?:\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+ \S+\[[^\]]*\] )?ERROR: (.*)$")
        .unwrap()
});

static REGISTRY: LazyLock<Arc<SessionRegistry>> =
    LazyLock::new(|| Arc::new(SessionRegistry::default()));
static START_LOCKS: LazyLock<tokio::sync::Mutex<HashMap<String, Arc<tokio::sync::Mutex<()>>>>> =
    LazyLock::new(|| tokio::sync::Mutex::new(HashMap::new()));
static NEXT_SESSION_ID: AtomicU64 = AtomicU64::new(1);

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ScrcpySource {
    Custom,
    Bundled,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct ScrcpyInfo {
    pub path: String,
    pub version: String,
    pub source: ScrcpySource,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MirrorPreset {
    Standard,
    Saver,
    High,
}

impl MirrorPreset {
    fn args(self) -> &'static [&'static str] {
        match self {
            Self::Standard => &[],
            Self::Saver => &["--max-size=1024", "--video-bit-rate=4M", "--max-fps=30"],
            Self::High => &["--video-bit-rate=16M"],
        }
    }
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MirrorOptions {
    pub turn_screen_off: bool,
    pub stay_awake: bool,
    pub show_touches: bool,
    pub always_on_top: bool,
    pub no_audio: bool,
    pub view_only: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MirrorRequest {
    scrcpy_path: Option<String>,
    preset: MirrorPreset,
    options: MirrorOptions,
    extra_args: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct MirrorSessionInfo {
    pub serial: String,
    pub session_id: u64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum MirrorOutcome {
    Closed,
    Stopped,
    Disconnected,
    Failed,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct MirrorExit {
    pub serial: String,
    pub session_id: u64,
    pub outcome: MirrorOutcome,
    pub error: Option<AppError>,
}

struct DetectedScrcpy {
    path: PathBuf,
    version: String,
    source: ScrcpySource,
}

#[tauri::command]
pub async fn detect_scrcpy(
    app: AppHandle,
    custom_path: Option<String>,
) -> Result<ScrcpyInfo, AppError> {
    let detected = detect(&app, custom_path.as_deref()).await?;
    Ok(ScrcpyInfo {
        path: detected.path.to_string_lossy().into_owned(),
        version: detected.version,
        source: detected.source,
    })
}

#[tauri::command]
pub fn parse_scrcpy_extra_args(text: String) -> Result<Vec<String>, AppError> {
    parse_extra_args(&text)
}

#[tauri::command]
pub async fn start_mirror(
    app: AppHandle,
    serial: String,
    request: MirrorRequest,
) -> Result<MirrorSessionInfo, AppError> {
    let start_lock = start_lock(&serial).await;
    let _start_guard = start_lock.lock().await;
    REGISTRY.ensure_can_start(&serial)?;

    let extra_args = parse_extra_args(&request.extra_args)?;
    // Detect on every start instead of trusting the frontend's cached result.
    let scrcpy = detect(&app, request.scrcpy_path.as_deref()).await?;
    let adb_path = adb::resolve_adb_path(&app)
        .map_err(|error| AppError::new(codes::MIRROR_START_FAILED).cause(error))?;

    let mut command = adb::new_async_command(&scrcpy.path);
    command.args(build_mirror_args(
        &serial,
        request.preset,
        &request.options,
        extra_args,
    ));
    // A second adb client of another version restarts the adb server and cuts
    // the application's Logcat and metrics streams, so scrcpy shares our adb.
    command.env("ADB", &adb_path);
    if let Some(lib_dir) = adb::embedded_linux_lib_dir(&app, &adb_path) {
        command.env("LD_LIBRARY_PATH", lib_dir);
    }

    let session_id = NEXT_SESSION_ID.fetch_add(1, Ordering::Relaxed);
    launch(
        Arc::clone(&REGISTRY),
        serial,
        session_id,
        command,
        TERMINATE_GRACE,
        move |exit| {
            if let Err(error) = app.emit(MIRROR_EXIT_EVENT, exit) {
                eprintln!("failed to emit mirror exit: {error}");
            }
        },
    )
    .await
}

#[tauri::command]
pub async fn stop_mirror(serial: String, session_id: u64) -> Result<(), AppError> {
    stop_session(&REGISTRY, &serial, session_id, STOP_TIMEOUT).await
}

#[tauri::command]
pub fn list_mirror_sessions() -> Vec<MirrorSessionInfo> {
    REGISTRY.list()
}

pub async fn shutdown_mirror_sessions() -> Result<(), AppError> {
    shutdown_sessions(&REGISTRY, SHUTDOWN_TIMEOUT).await
}

async fn start_lock(serial: &str) -> Arc<tokio::sync::Mutex<()>> {
    let mut locks = START_LOCKS.lock().await;
    Arc::clone(
        locks
            .entry(serial.to_string())
            .or_insert_with(|| Arc::new(tokio::sync::Mutex::new(()))),
    )
}

async fn detect(app: &AppHandle, custom_path: Option<&str>) -> Result<DetectedScrcpy, AppError> {
    let (path, source) = locate_scrcpy(custom_path, bundled_scrcpy_path(app), is_executable_file)?;
    let version = check_scrcpy_version(&read_version_output(&path).await?)?;
    Ok(DetectedScrcpy {
        path,
        version,
        source,
    })
}

// The official build finds scrcpy-server and its icons next to the executable,
// so the bundled files need no SCRCPY_SERVER_PATH or icon variables.
fn bundled_scrcpy_path(app: &AppHandle) -> Result<PathBuf, AppError> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|error| AppError::new(codes::MIRROR_NOT_FOUND).detail(error.to_string()))?;
    Ok(resource_dir.join("scrcpy").join(scrcpy_file_name()))
}

fn scrcpy_file_name() -> &'static str {
    if cfg!(windows) {
        "scrcpy.exe"
    } else {
        "scrcpy"
    }
}

fn is_executable_file(path: &Path) -> bool {
    let Ok(metadata) = std::fs::metadata(path) else {
        return false;
    };
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        metadata.is_file() && metadata.permissions().mode() & 0o111 != 0
    }
    #[cfg(not(unix))]
    {
        metadata.is_file()
    }
}

fn locate_scrcpy(
    custom_path: Option<&str>,
    bundled_path: Result<PathBuf, AppError>,
    is_executable: impl Fn(&Path) -> bool,
) -> Result<(PathBuf, ScrcpySource), AppError> {
    if let Some(custom) = custom_path {
        let path = PathBuf::from(custom);
        // A chosen path never falls back: another scrcpy would hide the wrong setting.
        return if path.is_absolute() && is_executable(&path) {
            Ok((path, ScrcpySource::Custom))
        } else {
            Err(AppError::new(codes::MIRROR_CUSTOM_PATH_INVALID).param("path", custom))
        };
    }
    let path = bundled_path?;
    if is_executable(&path) {
        Ok((path, ScrcpySource::Bundled))
    } else {
        Err(AppError::new(codes::MIRROR_NOT_FOUND))
    }
}

async fn read_version_output(path: &Path) -> Result<Output, AppError> {
    let child = adb::new_async_command(path)
        .arg("--version")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|error| {
            AppError::new(codes::MIRROR_VERSION_UNREADABLE).detail(error.to_string())
        })?;
    match tokio::time::timeout(VERSION_TIMEOUT, child.wait_with_output()).await {
        Ok(Ok(output)) => Ok(output),
        Ok(Err(error)) => {
            Err(AppError::new(codes::MIRROR_VERSION_UNREADABLE).detail(error.to_string()))
        }
        Err(_) => Err(AppError::new(codes::MIRROR_VERSION_TIMEOUT)),
    }
}

fn parse_scrcpy_version(stdout: &str) -> Option<((u32, u32), String)> {
    let captures = VERSION_RE.captures(stdout.lines().next()?)?;
    let major = captures[2].parse().ok()?;
    let minor = captures[3].parse().ok()?;
    Some(((major, minor), captures[1].to_string()))
}

fn check_scrcpy_version(output: &Output) -> Result<String, AppError> {
    let stdout = String::from_utf8_lossy(&output.stdout);
    let Some((number, version)) = parse_scrcpy_version(&stdout) else {
        return Err(AppError::new(codes::MIRROR_VERSION_UNREADABLE)
            .detail(output_excerpt(&output.stdout, &output.stderr)));
    };
    if number < MIN_VERSION {
        return Err(AppError::new(codes::MIRROR_TOO_OLD)
            .param("version", version)
            .param("minimum", format!("{}.{}", MIN_VERSION.0, MIN_VERSION.1)));
    }
    Ok(version)
}

fn output_excerpt(stdout: &[u8], stderr: &[u8]) -> String {
    let text = format!(
        "{}\n{}",
        String::from_utf8_lossy(stdout),
        String::from_utf8_lossy(stderr)
    );
    text.lines()
        .map(str::trim_end)
        .filter(|line| !line.is_empty())
        .take(VERSION_EXCERPT_LINES)
        .map(|line| truncate_utf8(line, STDERR_LINE_MAX_BYTES))
        .collect::<Vec<_>>()
        .join("\n")
}

fn truncate_utf8(text: &str, max_bytes: usize) -> &str {
    let mut end = text.len().min(max_bytes);
    while !text.is_char_boundary(end) {
        end -= 1;
    }
    &text[..end]
}

fn parse_extra_args(text: &str) -> Result<Vec<String>, AppError> {
    let args = split_extra_args(text)?;
    if let Some(option) = args.iter().find_map(|arg| forbidden_option(arg)) {
        return Err(AppError::new(codes::MIRROR_EXTRA_ARGS_FORBIDDEN).param("option", option));
    }
    Ok(args)
}

// Whitespace separates arguments and quotes group them. Backslashes are plain
// characters so Windows paths such as `C:\a\b` survive unchanged.
fn split_extra_args(text: &str) -> Result<Vec<String>, AppError> {
    let mut args = Vec::new();
    let mut current = String::new();
    let mut in_argument = false;
    let mut quote = None;
    for character in text.chars() {
        match quote {
            Some(open) if character == open => quote = None,
            Some(_) => current.push(character),
            None if character == '"' || character == '\'' => {
                quote = Some(character);
                in_argument = true;
            }
            None if character.is_whitespace() => {
                if in_argument {
                    args.push(std::mem::take(&mut current));
                    in_argument = false;
                }
            }
            None => {
                current.push(character);
                in_argument = true;
            }
        }
    }
    if quote.is_some() {
        return Err(AppError::new(codes::MIRROR_EXTRA_ARGS_UNCLOSED_QUOTE));
    }
    if in_argument {
        args.push(current);
    }
    Ok(args)
}

fn forbidden_option(arg: &str) -> Option<String> {
    if let Some(long) = arg.strip_prefix("--") {
        let name = long.split_once('=').map_or(long, |(name, _)| name);
        return (!name.is_empty()
            && FORBIDDEN_LONG_OPTIONS
                .iter()
                .any(|option| option.starts_with(name)))
        .then(|| format!("--{name}"));
    }
    for flag in arg.strip_prefix('-')?.chars() {
        if FORBIDDEN_SHORT_OPTIONS.contains(&flag) {
            return Some(format!("-{flag}"));
        }
        if SHORT_OPTIONS_WITH_VALUE.contains(&flag) {
            return None;
        }
    }
    None
}

fn build_mirror_args(
    serial: &str,
    preset: MirrorPreset,
    options: &MirrorOptions,
    extra_args: Vec<String>,
) -> Vec<String> {
    let mut args = vec!["-s".to_string(), serial.to_string()];
    args.extend(preset.args().iter().map(|arg| arg.to_string()));
    let flags = [
        (options.always_on_top, "--always-on-top"),
        (options.no_audio, "--no-audio"),
        (options.view_only, "--no-control"),
        // scrcpy refuses to start when these are combined with --no-control.
        (
            !options.view_only && options.turn_screen_off,
            "--turn-screen-off",
        ),
        (!options.view_only && options.stay_awake, "--stay-awake"),
        (!options.view_only && options.show_touches, "--show-touches"),
    ];
    args.extend(
        flags
            .into_iter()
            .filter(|(enabled, _)| *enabled)
            .map(|(_, flag)| flag.to_string()),
    );
    // Later scrcpy arguments override earlier ones, so user input comes last.
    args.extend(extra_args);
    args
}

#[derive(Default)]
struct StderrTail {
    lines: VecDeque<String>,
    current: Vec<u8>,
}

impl StderrTail {
    fn push(&mut self, bytes: &[u8]) {
        for &byte in bytes {
            if byte == b'\n' {
                self.finish_line();
            } else if self.current.len() < STDERR_LINE_MAX_BYTES + 3 {
                // Three spare bytes keep a character that straddles the limit
                // decodable, so truncation can cut at its boundary.
                self.current.push(byte);
            }
        }
    }

    fn finish_line(&mut self) {
        let bytes = std::mem::take(&mut self.current);
        let line = String::from_utf8_lossy(&bytes);
        let line = truncate_utf8(line.trim_end_matches('\r'), STDERR_LINE_MAX_BYTES).to_string();
        self.lines.push_back(line);
        if self.lines.len() > STDERR_MAX_LINES {
            self.lines.pop_front();
        }
    }

    fn into_lines(mut self) -> Vec<String> {
        if !self.current.is_empty() {
            self.finish_line();
        }
        self.lines.into()
    }
}

fn exit_diagnostic(lines: &[String]) -> String {
    let errors: Vec<&str> = lines
        .iter()
        .filter_map(|line| ERROR_LINE_RE.captures(line)?.get(1))
        .map(|message| message.as_str().trim_end())
        .filter(|message| !message.is_empty())
        .collect();
    if !errors.is_empty() {
        return errors.join("\n");
    }
    // getopt failures such as `unrecognized option` carry no ERROR prefix.
    let recent: Vec<&str> = lines
        .iter()
        .map(|line| line.trim_end())
        .filter(|line| !line.is_empty())
        .collect();
    recent[recent.len().saturating_sub(FALLBACK_DETAIL_LINES)..].join("\n")
}

fn classify_exit(
    stopped_by_app: bool,
    status: std::io::Result<ExitStatus>,
    stderr_lines: &[String],
) -> (MirrorOutcome, Option<AppError>) {
    let status = match status {
        Ok(status) => status,
        Err(error) => {
            return (
                MirrorOutcome::Failed,
                Some(AppError::new(codes::MIRROR_WAIT_FAILED).detail(error.to_string())),
            )
        }
    };
    if stopped_by_app {
        return (MirrorOutcome::Stopped, None);
    }
    let diagnostic = exit_diagnostic(stderr_lines);
    match status.code() {
        Some(0) => (MirrorOutcome::Closed, None),
        Some(DISCONNECTED_EXIT_CODE) => (
            MirrorOutcome::Disconnected,
            Some(AppError::new(codes::MIRROR_DISCONNECTED).detail(diagnostic)),
        ),
        Some(code) => (
            MirrorOutcome::Failed,
            Some(
                AppError::new(codes::MIRROR_EXIT_FAILED)
                    .param("code", code)
                    .detail(diagnostic),
            ),
        ),
        // Only Unix reports no code: a signal the application did not send.
        None => (
            MirrorOutcome::Failed,
            Some(
                AppError::new(codes::MIRROR_TERMINATED)
                    .detail(status.to_string())
                    .detail(diagnostic),
            ),
        ),
    }
}

struct SessionControl {
    stop_requested: AtomicBool,
    stop: Notify,
    exited: watch::Sender<bool>,
}

impl SessionControl {
    fn new() -> Self {
        Self {
            stop_requested: AtomicBool::new(false),
            stop: Notify::new(),
            exited: watch::Sender::new(false),
        }
    }

    fn request_stop(&self) {
        self.stop_requested.store(true, Ordering::SeqCst);
        // notify_one keeps a permit when the monitor is not waiting yet.
        self.stop.notify_one();
    }

    fn stop_requested(&self) -> bool {
        self.stop_requested.load(Ordering::SeqCst)
    }

    fn mark_exited(&self) {
        self.exited.send_replace(true);
    }

    async fn wait_exited(&self, timeout: Duration) -> bool {
        let mut exited = self.exited.subscribe();
        let result = tokio::time::timeout(timeout, exited.wait_for(|exited| *exited)).await;
        matches!(result, Ok(Ok(_)))
    }
}

struct MirrorSession {
    session_id: u64,
    control: Arc<SessionControl>,
}

#[derive(Default)]
struct SessionRegistry {
    sessions: Mutex<HashMap<String, MirrorSession>>,
    shutting_down: AtomicBool,
}

impl SessionRegistry {
    fn check_start(
        &self,
        sessions: &HashMap<String, MirrorSession>,
        serial: &str,
    ) -> Result<(), AppError> {
        if self.shutting_down.load(Ordering::SeqCst) {
            Err(AppError::new(codes::MIRROR_SHUTTING_DOWN))
        } else if sessions.contains_key(serial) {
            Err(AppError::new(codes::MIRROR_ALREADY_RUNNING))
        } else {
            Ok(())
        }
    }

    fn ensure_can_start(&self, serial: &str) -> Result<(), AppError> {
        self.check_start(&self.sessions.lock().unwrap(), serial)
    }

    fn register(
        &self,
        serial: &str,
        session_id: u64,
        control: Arc<SessionControl>,
    ) -> Result<(), AppError> {
        let mut sessions = self.sessions.lock().unwrap();
        self.check_start(&sessions, serial)?;
        sessions.insert(
            serial.to_string(),
            MirrorSession {
                session_id,
                control,
            },
        );
        Ok(())
    }

    fn control(&self, serial: &str, session_id: u64) -> Option<Arc<SessionControl>> {
        self.sessions
            .lock()
            .unwrap()
            .get(serial)
            .filter(|session| session.session_id == session_id)
            .map(|session| Arc::clone(&session.control))
    }

    fn remove(&self, serial: &str, session_id: u64) {
        let mut sessions = self.sessions.lock().unwrap();
        if sessions
            .get(serial)
            .is_some_and(|session| session.session_id == session_id)
        {
            sessions.remove(serial);
        }
    }

    fn list(&self) -> Vec<MirrorSessionInfo> {
        let mut sessions: Vec<MirrorSessionInfo> = self
            .sessions
            .lock()
            .unwrap()
            .iter()
            .map(|(serial, session)| MirrorSessionInfo {
                serial: serial.clone(),
                session_id: session.session_id,
            })
            .collect();
        sessions.sort_by(|left, right| left.serial.cmp(&right.serial));
        sessions
    }

    fn begin_shutdown(&self) -> Vec<Arc<SessionControl>> {
        let sessions = self.sessions.lock().unwrap();
        // Closing the gate under the same lock as register rejects late starts.
        self.shutting_down.store(true, Ordering::SeqCst);
        sessions
            .values()
            .map(|session| Arc::clone(&session.control))
            .collect()
    }
}

async fn launch(
    registry: Arc<SessionRegistry>,
    serial: String,
    session_id: u64,
    mut command: Command,
    terminate_grace: Duration,
    on_exit: impl FnOnce(MirrorExit) + Send + 'static,
) -> Result<MirrorSessionInfo, AppError> {
    let mut child = command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|error| AppError::new(codes::MIRROR_START_FAILED).detail(error.to_string()))?;
    let control = Arc::new(SessionControl::new());
    let registration = match child.stderr.take() {
        Some(stderr) => registry
            .register(&serial, session_id, Arc::clone(&control))
            .map(|()| stderr),
        None => Err(AppError::new(codes::MIRROR_START_FAILED)),
    };
    let stderr = match registration {
        Ok(stderr) => stderr,
        Err(error) => {
            return Err(match child.kill().await {
                Ok(()) => error,
                Err(cleanup) => error
                    .cause(AppError::new(codes::MIRROR_STOP_FAILED).detail(cleanup.to_string())),
            });
        }
    };

    let monitor_serial = serial.clone();
    tokio::spawn(async move {
        let (outcome, error) = monitor_child(child, stderr, &control, terminate_grace).await;
        // Unregister before emitting so a restart triggered by the event is accepted.
        registry.remove(&monitor_serial, session_id);
        on_exit(MirrorExit {
            serial: monitor_serial,
            session_id,
            outcome,
            error,
        });
        control.mark_exited();
    });
    Ok(MirrorSessionInfo { serial, session_id })
}

async fn monitor_child(
    mut child: Child,
    stderr: impl AsyncRead + Unpin + Send + 'static,
    control: &SessionControl,
    terminate_grace: Duration,
) -> (MirrorOutcome, Option<AppError>) {
    let tail = Arc::new(Mutex::new(StderrTail::default()));
    let mut reader = tokio::spawn(read_stderr(stderr, Arc::clone(&tail)));
    let status = wait_or_stop(&mut child, control, terminate_grace).await;
    // A grandchild that inherited stderr can hold the pipe open after scrcpy exits.
    if tokio::time::timeout(STDERR_JOIN_TIMEOUT, &mut reader)
        .await
        .is_err()
    {
        reader.abort();
    }
    let lines = std::mem::take(&mut *tail.lock().unwrap()).into_lines();
    classify_exit(control.stop_requested(), status, &lines)
}

async fn read_stderr(mut stderr: impl AsyncRead + Unpin, tail: Arc<Mutex<StderrTail>>) {
    let mut chunk = [0_u8; 1024];
    loop {
        match stderr.read(&mut chunk).await {
            Ok(0) => break,
            Ok(read) => tail.lock().unwrap().push(&chunk[..read]),
            Err(error) => {
                eprintln!("failed to read scrcpy stderr: {error}");
                break;
            }
        }
    }
}

async fn wait_or_stop(
    child: &mut Child,
    control: &SessionControl,
    terminate_grace: Duration,
) -> std::io::Result<ExitStatus> {
    tokio::select! {
        status = child.wait() => return status,
        () = control.stop.notified() => {}
    }
    terminate(child, terminate_grace).await
}

async fn terminate(child: &mut Child, grace: Duration) -> std::io::Result<ExitStatus> {
    request_graceful_exit(child);
    if let Ok(status) = tokio::time::timeout(grace, child.wait()).await {
        return status;
    }
    if let Err(error) = child.start_kill() {
        eprintln!("failed to kill scrcpy: {error}");
    }
    child.wait().await
}

#[cfg(unix)]
fn request_graceful_exit(child: &mut Child) {
    // scrcpy treats SIGTERM like closing its window and restores the device.
    let Some(pid) = child.id() else {
        return;
    };
    // SAFETY: the child has not been reaped yet, so the pid still names it.
    if unsafe { libc::kill(pid as libc::pid_t, libc::SIGTERM) } != 0 {
        eprintln!(
            "failed to send SIGTERM to scrcpy: {}",
            std::io::Error::last_os_error()
        );
    }
}

#[cfg(not(unix))]
fn request_graceful_exit(child: &mut Child) {
    // A GUI child on Windows has no console signal to receive; terminate it.
    if let Err(error) = child.start_kill() {
        eprintln!("failed to terminate scrcpy: {error}");
    }
}

async fn stop_session(
    registry: &SessionRegistry,
    serial: &str,
    session_id: u64,
    timeout: Duration,
) -> Result<(), AppError> {
    // A stale session id is a no-op: A -> B -> A reuses the serial.
    let Some(control) = registry.control(serial, session_id) else {
        return Ok(());
    };
    control.request_stop();
    if control.wait_exited(timeout).await {
        Ok(())
    } else {
        Err(AppError::new(codes::MIRROR_STOP_FAILED))
    }
}

async fn shutdown_sessions(registry: &SessionRegistry, timeout: Duration) -> Result<(), AppError> {
    let controls = registry.begin_shutdown();
    for control in &controls {
        control.request_stop();
    }
    let deadline = tokio::time::Instant::now() + timeout;
    let mut failures = Vec::new();
    for control in &controls {
        let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
        if !control.wait_exited(remaining).await {
            failures.push(AppError::new(codes::MIRROR_STOP_FAILED));
        }
    }
    if failures.is_empty() {
        return Ok(());
    }
    Err(AppError::new(codes::MIRROR_STOP_ALL_FAILED)
        .param("failed", failures.len())
        .param("total", controls.len())
        .causes(failures))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn option(arg: &str) -> Option<String> {
        parse_extra_args(arg)
            .err()
            .filter(|error| error.code == codes::MIRROR_EXTRA_ARGS_FORBIDDEN)
            .map(|error| match error.params.get("option") {
                Some(crate::error::ErrorParam::Text(option)) => option.clone(),
                other => panic!("unexpected option param: {other:?}"),
            })
    }

    fn output(stdout: &str, stderr: &str) -> Output {
        Output {
            status: ExitStatus::default(),
            stdout: stdout.as_bytes().to_vec(),
            stderr: stderr.as_bytes().to_vec(),
        }
    }

    fn strings(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| value.to_string()).collect()
    }

    #[test]
    fn parses_scrcpy_version_lines() {
        let current = "scrcpy 5.0.1 <https://github.com/Genymobile/scrcpy>\n\nDependencies (compiled / linked):\n - SDL: 3.4.18 / 3.4.18\n";
        assert_eq!(
            parse_scrcpy_version(current),
            Some(((5, 0), "5.0.1".to_string()))
        );
        assert_eq!(
            parse_scrcpy_version("scrcpy 2.0\n"),
            Some(((2, 0), "2.0".to_string()))
        );
        assert_eq!(
            parse_scrcpy_version("scrcpy 1.25 <https://github.com/Genymobile/scrcpy>"),
            Some(((1, 25), "1.25".to_string()))
        );
        assert_eq!(parse_scrcpy_version(""), None);
        assert_eq!(parse_scrcpy_version("usage: scrcpy [options]"), None);
        assert_eq!(parse_scrcpy_version("\nscrcpy 5.0.1"), None);
    }

    #[test]
    fn enforces_the_minimum_version_and_reports_unreadable_output() {
        assert_eq!(
            check_scrcpy_version(&output(
                "scrcpy 2.0 <https://github.com/Genymobile/scrcpy>\n",
                ""
            )),
            Ok("2.0".to_string())
        );
        let too_old = check_scrcpy_version(&output("scrcpy 1.25 <https://x>\n", "")).unwrap_err();
        assert_eq!(too_old.code, codes::MIRROR_TOO_OLD);
        assert_eq!(
            serde_json::to_value(&too_old).unwrap()["params"],
            serde_json::json!({ "version": "1.25", "minimum": "2.0" })
        );
        let unreadable =
            check_scrcpy_version(&output("garbage\n", "error: something broke\n")).unwrap_err();
        assert_eq!(unreadable.code, codes::MIRROR_VERSION_UNREADABLE);
        assert_eq!(
            unreadable.detail.as_deref(),
            Some("garbage\nerror: something broke")
        );
    }

    mod locate {
        use super::*;

        fn present(paths: Vec<PathBuf>) -> impl Fn(&Path) -> bool {
            move |path| paths.iter().any(|item| item == path)
        }

        fn custom_path() -> PathBuf {
            std::env::temp_dir().join("custom").join(scrcpy_file_name())
        }

        fn bundled_path() -> PathBuf {
            std::env::temp_dir()
                .join("resources")
                .join("scrcpy")
                .join(scrcpy_file_name())
        }

        #[test]
        fn prefers_a_valid_custom_path_over_the_bundled_one() {
            let custom = custom_path();
            assert_eq!(
                locate_scrcpy(
                    custom.to_str(),
                    Ok(bundled_path()),
                    present(vec![custom.clone(), bundled_path()])
                ),
                Ok((custom, ScrcpySource::Custom))
            );
        }

        #[test]
        fn reports_an_invalid_custom_path_without_using_the_bundled_one() {
            let custom = custom_path();
            let invalid = locate_scrcpy(
                custom.to_str(),
                Ok(bundled_path()),
                present(vec![bundled_path()]),
            )
            .unwrap_err();
            assert_eq!(invalid.code, codes::MIRROR_CUSTOM_PATH_INVALID);
            assert_eq!(
                serde_json::to_value(&invalid).unwrap()["params"],
                serde_json::json!({ "path": custom.to_str().unwrap() })
            );
        }

        #[test]
        fn rejects_a_relative_custom_path() {
            let relative = scrcpy_file_name();
            assert_eq!(
                locate_scrcpy(
                    Some(relative),
                    Ok(bundled_path()),
                    present(vec![PathBuf::from(relative), bundled_path()])
                )
                .unwrap_err()
                .code,
                codes::MIRROR_CUSTOM_PATH_INVALID
            );
        }

        #[test]
        fn accepts_a_custom_path_when_the_resource_directory_is_unavailable() {
            let custom = custom_path();
            assert_eq!(
                locate_scrcpy(
                    custom.to_str(),
                    Err(AppError::new(codes::MIRROR_NOT_FOUND).detail("no resources")),
                    present(vec![custom.clone()])
                ),
                Ok((custom, ScrcpySource::Custom))
            );
        }

        #[test]
        fn uses_the_bundled_scrcpy_without_a_custom_path() {
            assert_eq!(
                locate_scrcpy(None, Ok(bundled_path()), present(vec![bundled_path()])),
                Ok((bundled_path(), ScrcpySource::Bundled))
            );
        }

        #[test]
        fn reports_a_missing_bundled_scrcpy() {
            assert_eq!(
                locate_scrcpy(None, Ok(bundled_path()), present(Vec::new())),
                Err(AppError::new(codes::MIRROR_NOT_FOUND))
            );
        }

        #[test]
        fn keeps_the_resource_directory_failure_detail() {
            let failure = AppError::new(codes::MIRROR_NOT_FOUND).detail("no resources");
            assert_eq!(
                locate_scrcpy(None, Err(failure.clone()), present(Vec::new())),
                Err(failure)
            );
        }
    }

    #[test]
    fn serializes_the_scrcpy_source_for_the_frontend() {
        for (source, expected) in [
            (ScrcpySource::Custom, "custom"),
            (ScrcpySource::Bundled, "bundled"),
        ] {
            assert_eq!(
                serde_json::to_value(ScrcpyInfo {
                    path: "/app/scrcpy".to_string(),
                    version: "5.0.1".to_string(),
                    source,
                })
                .unwrap(),
                serde_json::json!({ "path": "/app/scrcpy", "version": "5.0.1", "source": expected })
            );
        }
    }

    #[test]
    fn splits_extra_args_on_whitespace_and_quotes() {
        assert_eq!(split_extra_args(""), Ok(Vec::new()));
        assert_eq!(split_extra_args("  \t\n "), Ok(Vec::new()));
        assert_eq!(
            split_extra_args("  --max-size=800\t --no-audio\n-Sw  "),
            Ok(strings(&["--max-size=800", "--no-audio", "-Sw"]))
        );
        assert_eq!(
            split_extra_args(r#"--window-title="ADB GUI test" 'a b' "it's" 'say "hi"'"#),
            Ok(strings(&[
                "--window-title=ADB GUI test",
                "a b",
                "it's",
                r#"say "hi""#
            ]))
        );
        assert_eq!(
            split_extra_args(r#"a"b c"d "" ''"#),
            Ok(strings(&["ab cd", "", ""]))
        );
        assert_eq!(
            split_extra_args(r"--record=C:\Users\me\clip.mp4 C:\a\b"),
            Ok(strings(&[r"--record=C:\Users\me\clip.mp4", r"C:\a\b"]))
        );
        for unclosed in [r#"--window-title="ADB GUI"#, "'abc", r#""a" 'b"#] {
            assert_eq!(
                split_extra_args(unclosed).unwrap_err().code,
                codes::MIRROR_EXTRA_ARGS_UNCLOSED_QUOTE,
                "{unclosed}"
            );
        }
    }

    #[test]
    fn rejects_device_selection_in_every_form() {
        for (args, expected) in [
            ("-s X", "-s"),
            ("--serial=X", "--serial"),
            ("--serial X", "--serial"),
            ("-sX", "-s"),
            ("-d", "-d"),
            ("--select-usb", "--select-usb"),
            ("-e", "-e"),
            ("--select-tcpip", "--select-tcpip"),
            ("--tcpip", "--tcpip"),
            ("--tcpip=192.168.1.2:5555", "--tcpip"),
            ("--otg", "--otg"),
            ("--ser=X", "--ser"),
            ("--tcp", "--tcp"),
            ("--ot", "--ot"),
            ("--select-u", "--select-u"),
            ("-Sd", "-d"),
            ("-wte", "-e"),
            ("--no-audio -Ss", "-s"),
        ] {
            assert_eq!(option(args), Some(expected.to_string()), "{args}");
        }
    }

    #[test]
    fn allows_ordinary_scrcpy_options() {
        for args in [
            "--max-size=800",
            "-m1024",
            "-b8M",
            "-bd",
            "-Sw",
            "--stay-awake --show-touches",
            "--window-title=-s",
            "--video-codec=h265 --crop=1224:1440:0:0",
            "--",
            "-",
        ] {
            assert_eq!(parse_extra_args(args).map(|_| ()), Ok(()), "{args}");
        }
    }

    #[test]
    fn builds_argv_from_presets_options_and_extra_args() {
        let none = MirrorOptions::default();
        assert_eq!(
            build_mirror_args("SER 1", MirrorPreset::Standard, &none, Vec::new()),
            strings(&["-s", "SER 1"])
        );
        assert_eq!(
            build_mirror_args("A", MirrorPreset::Saver, &none, Vec::new()),
            strings(&[
                "-s",
                "A",
                "--max-size=1024",
                "--video-bit-rate=4M",
                "--max-fps=30"
            ])
        );
        assert_eq!(
            build_mirror_args("A", MirrorPreset::High, &none, Vec::new()),
            strings(&["-s", "A", "--video-bit-rate=16M"])
        );
        let only = |enable: fn(&mut MirrorOptions)| {
            let mut options = none;
            enable(&mut options);
            options
        };
        for (options, flag) in [
            (
                only(|options| options.turn_screen_off = true),
                "--turn-screen-off",
            ),
            (only(|options| options.stay_awake = true), "--stay-awake"),
            (
                only(|options| options.show_touches = true),
                "--show-touches",
            ),
            (
                only(|options| options.always_on_top = true),
                "--always-on-top",
            ),
            (only(|options| options.no_audio = true), "--no-audio"),
            (only(|options| options.view_only = true), "--no-control"),
        ] {
            assert_eq!(
                build_mirror_args("A", MirrorPreset::Standard, &options, Vec::new()),
                strings(&["-s", "A", flag])
            );
        }
        let all = MirrorOptions {
            turn_screen_off: true,
            stay_awake: true,
            show_touches: true,
            always_on_top: true,
            no_audio: true,
            view_only: false,
        };
        assert_eq!(
            build_mirror_args("A", MirrorPreset::High, &all, strings(&["--max-fps=60"])),
            strings(&[
                "-s",
                "A",
                "--video-bit-rate=16M",
                "--always-on-top",
                "--no-audio",
                "--turn-screen-off",
                "--stay-awake",
                "--show-touches",
                "--max-fps=60",
            ])
        );
        let view_only = MirrorOptions {
            view_only: true,
            ..all
        };
        assert_eq!(
            build_mirror_args("A", MirrorPreset::Standard, &view_only, strings(&["-f"])),
            strings(&[
                "-s",
                "A",
                "--always-on-top",
                "--no-audio",
                "--no-control",
                "-f"
            ])
        );
    }

    #[test]
    fn deserializes_the_frontend_request_shape() {
        let request: MirrorRequest = serde_json::from_value(serde_json::json!({
            "scrcpyPath": null,
            "preset": "saver",
            "options": {
                "turnScreenOff": true,
                "stayAwake": false,
                "showTouches": false,
                "alwaysOnTop": true,
                "noAudio": false,
                "viewOnly": false
            },
            "extraArgs": "--max-fps=60"
        }))
        .unwrap();
        assert_eq!(request.scrcpy_path, None);
        assert_eq!(request.preset, MirrorPreset::Saver);
        assert!(request.options.turn_screen_off && request.options.always_on_top);
        assert_eq!(request.extra_args, "--max-fps=60");
        assert_eq!(
            serde_json::to_value(MirrorExit {
                serial: "A".to_string(),
                session_id: 3,
                outcome: MirrorOutcome::Disconnected,
                error: None,
            })
            .unwrap(),
            serde_json::json!({ "serial": "A", "session_id": 3, "outcome": "disconnected", "error": null })
        );
    }

    #[test]
    fn keeps_a_bounded_tail_of_stderr_lines() {
        let mut tail = StderrTail::default();
        tail.push(b"first\r\nsec");
        tail.push(b"ond\n\npartial");
        assert_eq!(
            tail.into_lines(),
            strings(&["first", "second", "", "partial"])
        );

        let mut tail = StderrTail::default();
        for index in 0..100 {
            tail.push(format!("line {index}\n").as_bytes());
        }
        let lines = tail.into_lines();
        assert_eq!(lines.len(), STDERR_MAX_LINES);
        assert_eq!(lines.first().map(String::as_str), Some("line 60"));
        assert_eq!(lines.last().map(String::as_str), Some("line 99"));

        let mut tail = StderrTail::default();
        tail.push("中".repeat(300).as_bytes());
        tail.push(b"\nERROR: after\n");
        let lines = tail.into_lines();
        assert_eq!(lines[0], "中".repeat(STDERR_LINE_MAX_BYTES / 3));
        assert_eq!(lines[1], "ERROR: after");
    }

    #[test]
    fn extracts_error_lines_including_nslog_prefixes() {
        assert_eq!(
            exit_diagnostic(&strings(&[
                "INFO: scrcpy 5.0.1",
                "ERROR: Could not find any ADB device",
                "2026-10-19 14:30:03.882 scrcpy[1234:5678] ERROR: Server connection failed",
                "error: XDG_RUNTIME_DIR is invalid",
                "WARN: ERROR: nested",
            ])),
            "Could not find any ADB device\nServer connection failed"
        );
        assert_eq!(
            exit_diagnostic(&strings(&[
                "1",
                "2",
                "",
                "3",
                "4",
                "5",
                "./scrcpy: unrecognized option '--bogus'",
                " "
            ])),
            "2\n3\n4\n5\n./scrcpy: unrecognized option '--bogus'"
        );
        assert_eq!(exit_diagnostic(&[]), "");
    }

    #[cfg(unix)]
    fn exit_status(code: i32) -> ExitStatus {
        use std::os::unix::process::ExitStatusExt;
        ExitStatus::from_raw(code << 8)
    }

    #[cfg(windows)]
    fn exit_status(code: i32) -> ExitStatus {
        use std::os::windows::process::ExitStatusExt;
        ExitStatus::from_raw(code as u32)
    }

    #[test]
    fn maps_exit_codes_to_outcomes() {
        let stderr = strings(&["ERROR: boom"]);
        assert_eq!(
            classify_exit(false, Ok(exit_status(0)), &stderr),
            (MirrorOutcome::Closed, None)
        );
        assert_eq!(
            classify_exit(false, Ok(exit_status(2)), &stderr),
            (
                MirrorOutcome::Disconnected,
                Some(AppError::new(codes::MIRROR_DISCONNECTED).detail("boom"))
            )
        );
        assert_eq!(
            classify_exit(false, Ok(exit_status(1)), &stderr),
            (
                MirrorOutcome::Failed,
                Some(
                    AppError::new(codes::MIRROR_EXIT_FAILED)
                        .param("code", 1)
                        .detail("boom")
                )
            )
        );
        assert_eq!(
            classify_exit(false, Ok(exit_status(1)), &[]),
            (
                MirrorOutcome::Failed,
                Some(AppError::new(codes::MIRROR_EXIT_FAILED).param("code", 1))
            )
        );
        for code in [0, 1, 2] {
            assert_eq!(
                classify_exit(true, Ok(exit_status(code)), &stderr),
                (MirrorOutcome::Stopped, None)
            );
        }
        let (outcome, error) = classify_exit(true, Err(std::io::Error::other("wait broke")), &[]);
        assert_eq!(outcome, MirrorOutcome::Failed);
        assert_eq!(error.unwrap().code, codes::MIRROR_WAIT_FAILED);
    }

    #[cfg(unix)]
    #[test]
    fn maps_foreign_signals_to_termination() {
        use std::os::unix::process::ExitStatusExt;
        let (outcome, error) = classify_exit(false, Ok(ExitStatus::from_raw(9)), &[]);
        assert_eq!(outcome, MirrorOutcome::Failed);
        let error = error.unwrap();
        assert_eq!(error.code, codes::MIRROR_TERMINATED);
        assert!(error.detail.unwrap().contains("signal: 9"));
        assert_eq!(
            classify_exit(true, Ok(ExitStatus::from_raw(15)), &[]),
            (MirrorOutcome::Stopped, None)
        );
    }

    #[test]
    fn registry_rejects_duplicates_and_stale_sessions() {
        let registry = SessionRegistry::default();
        registry
            .register("A", 1, Arc::new(SessionControl::new()))
            .unwrap();
        assert_eq!(
            registry.ensure_can_start("A").unwrap_err().code,
            codes::MIRROR_ALREADY_RUNNING
        );
        assert_eq!(
            registry
                .register("A", 2, Arc::new(SessionControl::new()))
                .unwrap_err()
                .code,
            codes::MIRROR_ALREADY_RUNNING
        );
        registry
            .register("B", 3, Arc::new(SessionControl::new()))
            .unwrap();
        assert!(registry.control("A", 2).is_none());
        registry.remove("A", 2);
        assert_eq!(
            registry.list(),
            vec![
                MirrorSessionInfo {
                    serial: "A".to_string(),
                    session_id: 1
                },
                MirrorSessionInfo {
                    serial: "B".to_string(),
                    session_id: 3
                },
            ]
        );
        registry.remove("A", 1);
        assert!(registry.ensure_can_start("A").is_ok());
        assert_eq!(registry.begin_shutdown().len(), 1);
        assert_eq!(
            registry.ensure_can_start("A").unwrap_err().code,
            codes::MIRROR_SHUTTING_DOWN
        );
    }

    #[cfg(unix)]
    mod process {
        use super::*;
        use tokio::sync::mpsc;

        fn shell(script: &str) -> Command {
            let mut command = Command::new("/bin/sh");
            command.args(["-c", script]);
            command
        }

        async fn start(
            registry: &Arc<SessionRegistry>,
            serial: &str,
            session_id: u64,
            script: &str,
            exits: &mpsc::UnboundedSender<MirrorExit>,
        ) -> Result<MirrorSessionInfo, AppError> {
            let exits = exits.clone();
            launch(
                Arc::clone(registry),
                serial.to_string(),
                session_id,
                shell(script),
                Duration::from_millis(200),
                move |exit| exits.send(exit).unwrap(),
            )
            .await
        }

        async fn next_exit(exits: &mut mpsc::UnboundedReceiver<MirrorExit>) -> MirrorExit {
            tokio::time::timeout(Duration::from_secs(10), exits.recv())
                .await
                .expect("mirror exit event")
                .expect("open channel")
        }

        #[tokio::test]
        async fn reaps_exits_and_reports_scrcpy_errors() {
            let registry = Arc::new(SessionRegistry::default());
            let (sender, mut exits) = mpsc::unbounded_channel();

            let info = start(
                &registry,
                "A",
                7,
                r#"echo "INFO: hi"; echo "ERROR: boom" >&2; exit 1"#,
                &sender,
            )
            .await
            .unwrap();
            assert_eq!(
                info,
                MirrorSessionInfo {
                    serial: "A".to_string(),
                    session_id: 7
                }
            );
            let exit = next_exit(&mut exits).await;
            assert_eq!(
                exit,
                MirrorExit {
                    serial: "A".to_string(),
                    session_id: 7,
                    outcome: MirrorOutcome::Failed,
                    error: Some(
                        AppError::new(codes::MIRROR_EXIT_FAILED)
                            .param("code", 1)
                            .detail("boom")
                    ),
                }
            );
            assert!(registry.list().is_empty());

            start(&registry, "A", 8, "exit 0", &sender).await.unwrap();
            assert_eq!(next_exit(&mut exits).await.outcome, MirrorOutcome::Closed);
            start(
                &registry,
                "A",
                9,
                "echo 'WARN: Device disconnected' >&2; exit 2",
                &sender,
            )
            .await
            .unwrap();
            let exit = next_exit(&mut exits).await;
            assert_eq!(exit.outcome, MirrorOutcome::Disconnected);
            assert_eq!(
                exit.error.unwrap().detail.as_deref(),
                Some("WARN: Device disconnected")
            );
        }

        #[tokio::test]
        async fn rejects_a_second_session_for_the_same_serial() {
            let registry = Arc::new(SessionRegistry::default());
            let (sender, mut exits) = mpsc::unbounded_channel();
            start(&registry, "A", 1, "exec sleep 30", &sender)
                .await
                .unwrap();
            assert_eq!(
                start(&registry, "A", 2, "exec sleep 30", &sender)
                    .await
                    .unwrap_err()
                    .code,
                codes::MIRROR_ALREADY_RUNNING
            );
            start(&registry, "B", 3, "exec sleep 30", &sender)
                .await
                .unwrap();
            assert_eq!(registry.list().len(), 2);
            shutdown_sessions(&registry, Duration::from_secs(5))
                .await
                .unwrap();
            let mut stopped = [next_exit(&mut exits).await, next_exit(&mut exits).await];
            stopped.sort_by_key(|exit| exit.session_id);
            assert_eq!(
                stopped
                    .iter()
                    .map(|exit| (exit.session_id, exit.outcome))
                    .collect::<Vec<_>>(),
                vec![(1, MirrorOutcome::Stopped), (3, MirrorOutcome::Stopped)]
            );
            assert!(registry.list().is_empty());
            assert_eq!(
                start(&registry, "C", 4, "exit 0", &sender)
                    .await
                    .unwrap_err()
                    .code,
                codes::MIRROR_SHUTTING_DOWN
            );
        }

        #[tokio::test]
        async fn stale_stop_leaves_the_current_session_running() {
            let registry = Arc::new(SessionRegistry::default());
            let (sender, mut exits) = mpsc::unbounded_channel();
            start(&registry, "A", 11, "exec sleep 30", &sender)
                .await
                .unwrap();
            stop_session(&registry, "A", 10, Duration::from_secs(1))
                .await
                .unwrap();
            assert_eq!(
                registry.list(),
                vec![MirrorSessionInfo {
                    serial: "A".to_string(),
                    session_id: 11
                }]
            );
            assert!(exits.try_recv().is_err());

            stop_session(&registry, "A", 11, Duration::from_secs(5))
                .await
                .unwrap();
            assert_eq!(
                next_exit(&mut exits).await,
                MirrorExit {
                    serial: "A".to_string(),
                    session_id: 11,
                    outcome: MirrorOutcome::Stopped,
                    error: None,
                }
            );
            assert!(registry.list().is_empty());
        }

        #[tokio::test]
        async fn escalates_to_sigkill_when_sigterm_is_ignored() {
            let registry = Arc::new(SessionRegistry::default());
            let (sender, mut exits) = mpsc::unbounded_channel();
            start(
                &registry,
                "A",
                21,
                r#"trap "" TERM; exec sleep 30"#,
                &sender,
            )
            .await
            .unwrap();
            // Let the shell install its trap before the stop request arrives.
            tokio::time::sleep(Duration::from_millis(300)).await;
            let started = std::time::Instant::now();
            stop_session(&registry, "A", 21, Duration::from_secs(5))
                .await
                .unwrap();
            assert!(started.elapsed() >= Duration::from_millis(200));
            assert_eq!(next_exit(&mut exits).await.outcome, MirrorOutcome::Stopped);
        }

        #[tokio::test]
        async fn reports_spawn_failures() {
            let registry = Arc::new(SessionRegistry::default());
            let error = launch(
                Arc::clone(&registry),
                "A".to_string(),
                1,
                Command::new("/nonexistent/scrcpy"),
                Duration::from_millis(200),
                |_| {},
            )
            .await
            .unwrap_err();
            assert_eq!(error.code, codes::MIRROR_START_FAILED);
            assert!(error.detail.is_some());
            assert!(registry.list().is_empty());
        }
    }
}
