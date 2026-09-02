use std::path::PathBuf;
use std::process::Command;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};
use tauri::{AppHandle, Manager};

#[cfg(windows)]
use std::ffi::OsString;
#[cfg(windows)]
use std::os::windows::ffi::{OsStrExt, OsStringExt};
#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
use std::path::Path;
#[cfg(windows)]
use std::time::{Duration, Instant};
#[cfg(windows)]
use windows_sys::Win32::{
    Foundation::{CloseHandle, HANDLE, INVALID_HANDLE_VALUE},
    Globalization::{CompareStringOrdinal, CSTR_EQUAL},
    System::{
        Diagnostics::ToolHelp::{
            CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
            TH32CS_SNAPPROCESS,
        },
        Threading::{OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION},
    },
};

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[cfg(windows)]
const ADB_SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(3);
#[cfg(windows)]
const ADB_SHUTDOWN_POLL_INTERVAL: Duration = Duration::from_millis(50);
#[cfg(windows)]
const ADB_ABSENCE_CONFIRMATION: Duration = Duration::from_millis(150);
#[cfg(windows)]
const ADB_KILL_RETRY_INTERVAL: Duration = Duration::from_millis(250);

pub struct AppState {
    pub adb_path: Mutex<String>,
    shutting_down: AtomicBool,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            adb_path: Mutex::new(String::new()),
            shutting_down: AtomicBool::new(false),
        }
    }
}

pub fn begin_shutdown(app: &AppHandle) {
    app.state::<AppState>()
        .shutting_down
        .store(true, Ordering::SeqCst);
}

pub fn is_shutting_down(app: &AppHandle) -> bool {
    app.state::<AppState>().shutting_down.load(Ordering::SeqCst)
}

pub fn resolve_adb_path(app: &AppHandle) -> Result<String, String> {
    let state = app.state::<AppState>();
    if state.shutting_down.load(Ordering::SeqCst) {
        return Err("application is shutting down".to_string());
    }
    {
        let cached = state.adb_path.lock().unwrap();
        if !cached.is_empty() {
            return Ok(cached.clone());
        }
    }

    let path = find_adb(app)?;
    let mut cached = state.adb_path.lock().unwrap();
    *cached = path.clone();
    Ok(path)
}

fn find_adb(app: &AppHandle) -> Result<String, String> {
    if let Ok(p) = which_adb() {
        return Ok(p);
    }

    if let Ok(home) = std::env::var("ANDROID_HOME") {
        let candidate = if cfg!(target_os = "windows") {
            PathBuf::from(home).join("platform-tools").join("adb.exe")
        } else {
            PathBuf::from(home).join("platform-tools").join("adb")
        };
        if candidate.exists() {
            return Ok(candidate.to_string_lossy().to_string());
        }
    }

    if let Ok(sdk) = std::env::var("ANDROID_SDK_ROOT") {
        let candidate = if cfg!(target_os = "windows") {
            PathBuf::from(sdk).join("platform-tools").join("adb.exe")
        } else {
            PathBuf::from(sdk).join("platform-tools").join("adb")
        };
        if candidate.exists() {
            return Ok(candidate.to_string_lossy().to_string());
        }
    }

    let resource_dir = app.path().resource_dir().map_err(|e| e.to_string())?;
    let platform_dir = if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(target_os = "windows") {
        "windows"
    } else {
        "linux"
    };
    let adb_name = if cfg!(target_os = "windows") {
        "adb.exe"
    } else {
        "adb"
    };
    let embedded = resource_dir.join(platform_dir).join(adb_name);
    if embedded.exists() {
        if cfg!(target_family = "unix") {
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let perms = std::fs::metadata(&embedded).map_err(|e| e.to_string())?;
                let mut perms = perms.permissions();
                perms.set_mode(0o755);
                std::fs::set_permissions(&embedded, perms).map_err(|e| e.to_string())?;
            }
        }
        return Ok(embedded.to_string_lossy().to_string());
    }

    Err("adb not found. Install Android Platform Tools or set ANDROID_HOME.".into())
}

pub fn prepare_command(app: &AppHandle, adb_path: &str) -> Command {
    let mut command = new_command(adb_path);
    if let Some(lib_dir) = embedded_linux_lib_dir(app, adb_path) {
        command.env("LD_LIBRARY_PATH", lib_dir);
    }
    command
}

pub fn prepare_async_command(app: &AppHandle, adb_path: &str) -> tokio::process::Command {
    let mut command = tokio::process::Command::new(adb_path);
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);
    if let Some(lib_dir) = embedded_linux_lib_dir(app, adb_path) {
        command.env("LD_LIBRARY_PATH", lib_dir);
    }
    command
}

fn new_command(program: &str) -> Command {
    let command = Command::new(program);
    #[cfg(windows)]
    let command = {
        let mut command = command;
        command.creation_flags(CREATE_NO_WINDOW);
        command
    };
    command
}

fn embedded_linux_lib_dir(app: &AppHandle, adb_path: &str) -> Option<PathBuf> {
    #[cfg(target_os = "linux")]
    {
        let resource_dir = app.path().resource_dir().ok()?;
        if is_path_within(adb_path, &resource_dir) {
            let lib_dir = resource_dir.join("linux").join("lib64");
            if lib_dir.is_dir() {
                return Some(lib_dir);
            }
        }
    }

    let _ = (app, adb_path);
    None
}

#[cfg(target_os = "linux")]
fn is_path_within(path: &str, root: &PathBuf) -> bool {
    PathBuf::from(path).starts_with(root)
}

#[cfg(unix)]
fn which_adb() -> Result<String, String> {
    let output = new_command("which")
        .arg("adb")
        .output()
        .map_err(|e| format!("which failed: {e}"))?;
    if output.status.success() {
        let p = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if !p.is_empty() {
            return Ok(p);
        }
    }
    Err("adb not in PATH".into())
}

#[cfg(windows)]
fn which_adb() -> Result<String, String> {
    let output = new_command("where")
        .arg("adb")
        .output()
        .map_err(|e| format!("where failed: {e}"))?;
    if output.status.success() {
        let p = String::from_utf8_lossy(&output.stdout)
            .lines()
            .next()
            .unwrap_or("")
            .trim()
            .to_string();
        if !p.is_empty() {
            return Ok(p);
        }
    }
    Err("adb not in PATH".into())
}

pub fn get_adb_version(app: &AppHandle, adb_path: &str) -> String {
    let output = prepare_command(app, adb_path).arg("version").output();
    match output {
        Ok(o) => {
            let text = String::from_utf8_lossy(&o.stdout);
            text.lines()
                .find(|l| l.contains("Version"))
                .and_then(|l| l.split_whitespace().nth(1))
                .map(|s| s.to_string())
                .unwrap_or_else(|| "unknown".to_string())
        }
        Err(_) => "unknown".to_string(),
    }
}

pub fn adb_source(adb_path: &str, app: &AppHandle) -> String {
    let resource_dir = app
        .path()
        .resource_dir()
        .map(|d| d.to_string_lossy().to_string())
        .unwrap_or_default();
    if adb_path.starts_with(&resource_dir) {
        "embedded".to_string()
    } else if std::env::var("ANDROID_HOME")
        .map(|h| adb_path.contains(&h))
        .unwrap_or(false)
        || std::env::var("ANDROID_SDK_ROOT")
            .map(|h| adb_path.contains(&h))
            .unwrap_or(false)
    {
        "sdk".to_string()
    } else {
        "system".to_string()
    }
}

#[cfg(not(windows))]
pub fn shutdown_embedded_adb_server(_app: &AppHandle) -> Result<(), String> {
    Ok(())
}

#[cfg(windows)]
pub fn shutdown_embedded_adb_server(app: &AppHandle) -> Result<(), String> {
    let adb_path = {
        let state = app.state::<AppState>();
        let cached = state.adb_path.lock().unwrap();
        if cached.is_empty() {
            return Ok(());
        }
        PathBuf::from(cached.as_str())
    };
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|error| error.to_string())?;
    let expected_path = resource_dir.join("windows").join("adb.exe");
    if !windows_paths_equal(&adb_path, &expected_path) {
        return Ok(());
    }

    stop_adb_server_at_path(app, &adb_path)
}

#[cfg(windows)]
fn stop_adb_server_at_path(app: &AppHandle, adb_path: &Path) -> Result<(), String> {
    let started_at = Instant::now();
    let mut empty_since = None;
    let mut next_kill_attempt = started_at;
    let mut last_error = None;

    loop {
        let process_ids = windows_process_ids_at_path(adb_path)?;
        let now = Instant::now();
        if process_ids.is_empty() {
            let absence_started = empty_since.get_or_insert(now);
            if now.duration_since(*absence_started) >= ADB_ABSENCE_CONFIRMATION {
                return Ok(());
            }
        } else {
            empty_since = None;
            if now >= next_kill_attempt {
                match prepare_command(app, &adb_path.to_string_lossy())
                    .arg("kill-server")
                    .output()
                {
                    Ok(output) if output.status.success() => last_error = None,
                    Ok(output) => {
                        let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
                        last_error = Some(if detail.is_empty() {
                            format!("adb kill-server exited with {}", output.status)
                        } else {
                            detail
                        });
                    }
                    Err(error) => {
                        last_error = Some(format!("failed to run adb kill-server: {error}"))
                    }
                }
                next_kill_attempt = now + ADB_KILL_RETRY_INTERVAL;
            }
        }

        if now.duration_since(started_at) >= ADB_SHUTDOWN_TIMEOUT {
            let process_ids = windows_process_ids_at_path(adb_path)?;
            if process_ids.is_empty() {
                return Ok(());
            }
            let detail = last_error
                .map(|error| format!(" Last error: {error}"))
                .unwrap_or_default();
            return Err(format!(
                "bundled ADB server did not exit within 3 seconds (PIDs: {}).{detail}",
                process_ids
                    .iter()
                    .map(u32::to_string)
                    .collect::<Vec<_>>()
                    .join(", ")
            ));
        }

        std::thread::sleep(ADB_SHUTDOWN_POLL_INTERVAL);
    }
}

#[cfg(windows)]
fn windows_process_ids_at_path(expected_path: &Path) -> Result<Vec<u32>, String> {
    // SAFETY: the returned snapshot handle is validated and owned until this function returns.
    let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
    if snapshot == INVALID_HANDLE_VALUE {
        return Err(format!(
            "failed to enumerate Windows processes: {}",
            std::io::Error::last_os_error()
        ));
    }
    let snapshot = OwnedHandle(snapshot);
    let mut entry = PROCESSENTRY32W {
        dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
        ..Default::default()
    };
    let mut matches = Vec::new();

    // SAFETY: entry has the required size and remains valid for the complete enumeration.
    let mut has_entry = unsafe { Process32FirstW(snapshot.0, &mut entry) } != 0;
    while has_entry {
        if process_entry_name(&entry).eq_ignore_ascii_case("adb.exe") {
            if let Some(path) = process_image_path(entry.th32ProcessID) {
                if windows_paths_equal(&path, expected_path) {
                    matches.push(entry.th32ProcessID);
                }
            }
        }
        // SAFETY: snapshot and entry remain valid until the loop completes.
        has_entry = unsafe { Process32NextW(snapshot.0, &mut entry) } != 0;
    }

    Ok(matches)
}

#[cfg(windows)]
fn process_entry_name(entry: &PROCESSENTRY32W) -> String {
    let length = entry
        .szExeFile
        .iter()
        .position(|character| *character == 0)
        .unwrap_or(entry.szExeFile.len());
    String::from_utf16_lossy(&entry.szExeFile[..length])
}

#[cfg(windows)]
fn process_image_path(process_id: u32) -> Option<PathBuf> {
    // SAFETY: the process handle is checked for null and closed by OwnedHandle.
    let process = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, process_id) };
    if process.is_null() {
        return None;
    }
    let process = OwnedHandle(process);
    let mut buffer = vec![0_u16; 32_768];
    let mut length = buffer.len() as u32;
    // SAFETY: buffer is writable for length UTF-16 code units and the process handle is valid.
    if unsafe { QueryFullProcessImageNameW(process.0, 0, buffer.as_mut_ptr(), &mut length) } == 0 {
        return None;
    }
    buffer.truncate(length as usize);
    Some(PathBuf::from(OsString::from_wide(&buffer)))
}

#[cfg(windows)]
fn windows_paths_equal(left: &Path, right: &Path) -> bool {
    let left: Vec<u16> = left.as_os_str().encode_wide().collect();
    let right: Vec<u16> = right.as_os_str().encode_wide().collect();
    // SAFETY: both pointers are valid for their explicit UTF-16 lengths.
    unsafe {
        CompareStringOrdinal(
            left.as_ptr(),
            left.len() as i32,
            right.as_ptr(),
            right.len() as i32,
            1,
        ) == CSTR_EQUAL
    }
}

#[cfg(windows)]
struct OwnedHandle(HANDLE);

#[cfg(windows)]
impl Drop for OwnedHandle {
    fn drop(&mut self) {
        // SAFETY: OwnedHandle is created only from a valid owned Windows handle.
        unsafe {
            CloseHandle(self.0);
        }
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::windows_paths_equal;
    use std::path::Path;

    #[test]
    fn windows_path_matching_is_case_insensitive_and_exact() {
        assert!(windows_paths_equal(
            Path::new(r"C:\Users\Gin\AppData\Local\ADB GUI\windows\adb.exe"),
            Path::new(r"c:\users\gin\appdata\local\adb gui\WINDOWS\ADB.EXE")
        ));
        assert!(!windows_paths_equal(
            Path::new(r"C:\Android\platform-tools\adb.exe"),
            Path::new(r"C:\Users\Gin\AppData\Local\ADB GUI\windows\adb.exe")
        ));
        assert!(!windows_paths_equal(
            Path::new(r"C:\Users\Gin\AppData\Local\ADB GUI\windows\adb-old.exe"),
            Path::new(r"C:\Users\Gin\AppData\Local\ADB GUI\windows\adb.exe")
        ));
    }
}
