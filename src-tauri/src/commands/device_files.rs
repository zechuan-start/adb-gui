use crate::{error::AppError, error_codes as codes};
use std::fs::{self, OpenOptions};
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use base64::Engine;
use serde::Serialize;
use tauri::AppHandle;

use super::device::{run_adb_bytes_with_serial, run_adb_output_with_serial, run_adb_with_serial};

const DEFAULT_DEVICE_DIRECTORY: &str = "/sdcard/Download";
const MAX_IMAGE_PREVIEW_BYTES: u64 = 20 * 1024 * 1024;
const MAX_IMAGE_PREVIEW_READ_BYTES: u64 = MAX_IMAGE_PREVIEW_BYTES + 1;
const MAX_AUTORENAME_ATTEMPTS: usize = 10_000;

const NOT_DIRECTORY_EXIT: i32 = 41;
const DIRECTORY_PERMISSION_EXIT: i32 = 42;
const NOT_FILE_EXIT: i32 = 43;

// Toybox stat does not interpret NUL escapes. Each batch contains newline-delimited
// numeric metadata, a NUL, then matching NUL-delimited paths in the same order.
fn list_directory_script() -> String {
    format!(
        r#"export LC_ALL=C
target=$1
if [ ! -d "$target" ]; then
  exit {NOT_DIRECTORY_EXIT}
fi
if [ ! -r "$target" ] || [ ! -x "$target" ]; then
  exit {DIRECTORY_PERMISSION_EXIT}
fi
prefix=$target
if [ "$prefix" = "/" ]; then
  prefix=""
fi
emit_batch() {{
  stat -c '%f %s %Y' "$@" || return 3
  printf '\000'
  printf '%s\000' "$@"
}}
set --
batch_bytes=0
for item in "$prefix"/* "$prefix"/.[!.]* "$prefix"/..?*; do
  if [ ! -e "$item" ] && [ ! -L "$item" ]; then
    continue
  fi
  set -- "$@" "$item"
  batch_bytes=$((batch_bytes + ${{#item}} + 1))
  # Bound argv bytes and pointer count, leaving room for the environment.
  if [ "$#" -ge 128 ] || [ "$batch_bytes" -ge 16384 ]; then
    emit_batch "$@" || exit 3
    set --
    batch_bytes=0
  fi
done
if [ "$#" -gt 0 ]; then
  emit_batch "$@" || exit 3
fi"#
    )
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum DeviceFileKind {
    Directory,
    File,
    Symlink,
    Other,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct DeviceFileEntry {
    pub name: String,
    pub path: String,
    pub kind: DeviceFileKind,
    pub size: u64,
    pub modified_at: i64,
    pub previewable: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct DeviceDirectoryListing {
    pub path: String,
    pub parent: Option<String>,
    pub entries: Vec<DeviceFileEntry>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DeviceTransferResult {
    pub name: String,
    pub remote_path: String,
    pub local_path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DeviceImagePreview {
    pub data_url: String,
    pub mime_type: String,
    pub size: u64,
}

#[tauri::command]
pub async fn list_device_directory(
    app: AppHandle,
    serial: String,
    path: Option<String>,
) -> Result<DeviceDirectoryListing, AppError> {
    let path = normalize_device_path(path.as_deref().unwrap_or(DEFAULT_DEVICE_DIRECTORY))?;
    tauri::async_runtime::spawn_blocking(move || list_directory(&app, &serial, &path))
        .await
        .map_err(|error| AppError::new(codes::FILES_LIST_WORKER_FAILED).detail(error.to_string()))?
}

#[tauri::command]
pub async fn create_device_directory(
    app: AppHandle,
    serial: String,
    parent_path: String,
    name: String,
) -> Result<DeviceFileEntry, AppError> {
    let parent_path = normalize_device_path(&parent_path)?;
    validate_device_name(&name)?;

    tauri::async_runtime::spawn_blocking(move || {
        let path = join_device_path(&parent_path, &name);
        let command = format!("mkdir {}", shell_quote(&path));
        run_adb_with_serial(&app, &serial, &["shell", &command])
            .map_err(|error| AppError::new(codes::FILES_CREATE_FAILED).cause(error))?;

        list_directory(&app, &serial, &parent_path)?
            .entries
            .into_iter()
            .find(|entry| entry.path == path)
            .ok_or_else(|| AppError::new(codes::FILES_CREATED_DIRECTORY_MISSING))
    })
    .await
    .map_err(|error| AppError::new(codes::FILES_CREATE_WORKER_FAILED).detail(error.to_string()))?
}

#[tauri::command]
pub async fn upload_device_file(
    app: AppHandle,
    serial: String,
    local_path: String,
    remote_dir: String,
) -> Result<DeviceTransferResult, AppError> {
    let remote_dir = normalize_device_path(&remote_dir)?;

    tauri::async_runtime::spawn_blocking(move || {
        let local = Path::new(&local_path);
        let metadata = fs::metadata(local).map_err(|error| {
            AppError::new(codes::FILES_READ_LOCAL_FAILED).detail(error.to_string())
        })?;
        if !metadata.is_file() {
            return Err(AppError::new(codes::FILES_UPLOAD_REGULAR_ONLY));
        }

        let original_name = local
            .file_name()
            .and_then(|name| name.to_str())
            .filter(|name| !name.is_empty())
            .ok_or_else(|| AppError::new(codes::FILES_LOCAL_NAME_UNAVAILABLE))?;
        validate_device_name(original_name)?;

        validate_remote_upload_directory(&app, &serial, &remote_dir)?;
        let (name, remote_path) =
            find_available_remote_path(&app, &serial, &remote_dir, original_name)?;

        push_device_file_with(name, remote_path, local_path, |args| {
            run_adb_with_serial(&app, &serial, args)
        })
    })
    .await
    .map_err(|error| AppError::new(codes::FILES_UPLOAD_WORKER_FAILED).detail(error.to_string()))?
}

fn push_device_file_with<F>(
    name: String,
    remote_path: String,
    local_path: String,
    execute: F,
) -> Result<DeviceTransferResult, AppError>
where
    F: FnOnce(&[&str]) -> Result<String, AppError>,
{
    execute(&["push", &local_path, &remote_path])
        .map_err(|error| AppError::new(codes::FILES_UPLOAD_FAILED).cause(error))?;

    Ok(DeviceTransferResult {
        name,
        remote_path,
        local_path: Some(local_path),
    })
}

#[tauri::command]
pub async fn download_device_file(
    app: AppHandle,
    serial: String,
    remote_path: String,
    local_path: String,
) -> Result<DeviceTransferResult, AppError> {
    let remote_path = normalize_device_path(&remote_path)?;

    tauri::async_runtime::spawn_blocking(move || {
        let remote_size = remote_file_size(&app, &serial, &remote_path)?;
        let target = PathBuf::from(&local_path);
        validate_download_target(&target)?;
        let temp_path = reserve_sibling_file(&target, "download")?;

        let result = (|| {
            let temp_path_string = temp_path.to_string_lossy().to_string();
            run_adb_with_serial(&app, &serial, &["pull", &remote_path, &temp_path_string])
                .map_err(|error| AppError::new(codes::FILES_DOWNLOAD_FAILED).cause(error))?;

            let local_size = fs::metadata(&temp_path)
                .map_err(|error| {
                    AppError::new(codes::FILES_READ_TEMP_FAILED).detail(error.to_string())
                })?
                .len();
            if local_size != remote_size {
                return Err(AppError::new(codes::FILES_DOWNLOAD_SIZE_MISMATCH)
                    .param("remote", remote_size)
                    .param("local", local_size));
            }

            replace_download_target(&temp_path, &target)
        })();

        if result.is_err() {
            remove_file_if_present(&temp_path);
        }
        result?;

        let name = target
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or_else(|| AppError::new(codes::FILES_SAVE_NAME_UNAVAILABLE))?
            .to_string();

        Ok(DeviceTransferResult {
            name,
            remote_path,
            local_path: Some(local_path),
        })
    })
    .await
    .map_err(|error| AppError::new(codes::FILES_DOWNLOAD_WORKER_FAILED).detail(error.to_string()))?
}

#[tauri::command]
pub async fn preview_device_image(
    app: AppHandle,
    serial: String,
    remote_path: String,
) -> Result<DeviceImagePreview, AppError> {
    let remote_path = normalize_device_path(&remote_path)?;

    tauri::async_runtime::spawn_blocking(move || {
        let expected_size = remote_file_size(&app, &serial, &remote_path)?;
        read_image_preview_with(&remote_path, expected_size, |args| {
            run_adb_bytes_with_serial(&app, &serial, args)
        })
    })
    .await
    .map_err(|error| AppError::new(codes::FILES_PREVIEW_WORKER_FAILED).detail(error.to_string()))?
}

fn read_image_preview_with<F>(
    remote_path: &str,
    expected_size: u64,
    read: F,
) -> Result<DeviceImagePreview, AppError>
where
    F: FnOnce(&[&str]) -> Result<Vec<u8>, AppError>,
{
    if expected_size > MAX_IMAGE_PREVIEW_BYTES {
        return Err(AppError::new(codes::FILES_PREVIEW_TOO_LARGE).param("bytes", expected_size));
    }

    let command = preview_read_command(remote_path);
    let bytes = read(&["exec-out", &command])
        .map_err(|error| AppError::new(codes::FILES_READ_IMAGE_FAILED).cause(error))?;
    let actual_size = bytes.len() as u64;
    if actual_size > MAX_IMAGE_PREVIEW_BYTES {
        return Err(AppError::new(codes::FILES_PREVIEW_READ_TOO_LARGE).param("bytes", actual_size));
    }
    if actual_size != expected_size {
        return Err(AppError::new(codes::FILES_IMAGE_INCOMPLETE)
            .param("expected", expected_size)
            .param("actual", actual_size));
    }

    let mime_type =
        detect_image_mime(&bytes).ok_or_else(|| AppError::new(codes::FILES_PREVIEW_FORMAT))?;
    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);

    Ok(DeviceImagePreview {
        data_url: format!("data:{mime_type};base64,{encoded}"),
        mime_type: mime_type.to_string(),
        size: actual_size,
    })
}

fn list_directory(
    app: &AppHandle,
    serial: &str,
    path: &str,
) -> Result<DeviceDirectoryListing, AppError> {
    let command = shell_script_command(&list_directory_script(), path);
    // Shell v2 without a PTY preserves NUL records and reports remote failures separately.
    let output =
        run_adb_output_with_serial(app, serial, &["shell", "-T", &command]).map_err(|error| {
            AppError::new(codes::FILES_LIST_FAILED)
                .param("path", path)
                .cause(error)
        })?;
    check_file_output(&output, path)?;
    let entries = parse_directory_records(&output.stdout, path)?;

    Ok(DeviceDirectoryListing {
        path: path.to_string(),
        parent: device_parent_path(path),
        entries,
    })
}

fn parse_directory_records(
    output: &[u8],
    directory: &str,
) -> Result<Vec<DeviceFileEntry>, AppError> {
    let output = trim_protocol_line_endings(output);
    if output.is_empty() {
        return Ok(Vec::new());
    }
    if output.last() != Some(&0) {
        return Err(AppError::new(codes::FILES_MISSING_DELIMITER));
    }

    let mut fields = output[..output.len() - 1].split(|byte| *byte == 0);
    let mut entries = Vec::new();
    while let Some(metadata) = fields.next() {
        let metadata = utf8_field(metadata, codes::FILES_METADATA_NOT_UTF8)?;
        let rows = metadata
            .strip_suffix('\n')
            .filter(|rows| !rows.is_empty())
            .ok_or_else(|| AppError::new(codes::FILES_INVALID_BATCH_METADATA))?;
        for row in rows.split('\n') {
            let path = fields
                .next()
                .ok_or_else(|| AppError::new(codes::FILES_MISSING_BATCH_PATH))?;
            entries.push(parse_directory_entry(row, path, directory)?);
        }
    }

    Ok(entries)
}

fn parse_directory_entry(
    metadata: &str,
    path: &[u8],
    directory: &str,
) -> Result<DeviceFileEntry, AppError> {
    let fields: Vec<&str> = metadata.split(' ').collect();
    let [mode, size, modified_at] = fields.as_slice() else {
        return Err(AppError::new(codes::FILES_INVALID_FIELD_COUNT).param("count", fields.len()));
    };
    let mode = u32::from_str_radix(mode, 16)
        .map_err(|error| AppError::new(codes::FILES_INVALID_MODE).detail(error.to_string()))?;
    let kind = match mode & 0o170000 {
        0o040000 => DeviceFileKind::Directory,
        0o100000 => DeviceFileKind::File,
        0o120000 => DeviceFileKind::Symlink,
        0o010000 | 0o020000 | 0o060000 | 0o140000 => DeviceFileKind::Other,
        _ => {
            return Err(AppError::new(codes::FILES_UNKNOWN_KIND).param("value", format!("{mode:x}")))
        }
    };
    let size = size
        .parse::<u64>()
        .map_err(|error| AppError::new(codes::FILES_INVALID_SIZE).detail(error.to_string()))?;
    let modified_at = modified_at.parse::<i64>().map_err(|error| {
        AppError::new(codes::FILES_INVALID_MODIFIED_AT).detail(error.to_string())
    })?;
    let path = normalize_device_path(utf8_field(path, codes::FILES_PATH_NOT_UTF8)?)?;
    if device_parent_path(&path).as_deref() != Some(directory) {
        return Err(AppError::new(codes::FILES_OUT_OF_SCOPE).param("path", path));
    }
    let name = device_file_name(&path)?;
    let previewable = matches!(kind, DeviceFileKind::File) && is_previewable_name(&name);
    Ok(DeviceFileEntry {
        name,
        path,
        kind,
        size,
        modified_at,
        previewable,
    })
}

fn trim_protocol_line_endings(mut output: &[u8]) -> &[u8] {
    while output
        .last()
        .is_some_and(|byte| matches!(*byte, b'\r' | b'\n'))
    {
        output = &output[..output.len() - 1];
    }
    output
}

fn utf8_field<'a>(value: &'a [u8], code: &'static str) -> Result<&'a str, AppError> {
    std::str::from_utf8(value).map_err(|error| AppError::new(code).detail(error.to_string()))
}

fn normalize_device_path(path: &str) -> Result<String, AppError> {
    if path.is_empty() || !path.starts_with('/') {
        return Err(AppError::new(codes::FILES_ABSOLUTE_DEVICE_PATH));
    }
    if path.contains('\0') {
        return Err(AppError::new(codes::FILES_PATH_CONTAINS_NUL));
    }

    let mut segments = Vec::new();
    for segment in path.split('/') {
        match segment {
            "" | "." => {}
            ".." => {
                if segments.pop().is_none() {
                    return Err(AppError::new(codes::FILES_PATH_ABOVE_ROOT));
                }
            }
            value => segments.push(value),
        }
    }

    if segments.is_empty() {
        Ok("/".to_string())
    } else {
        Ok(format!("/{}", segments.join("/")))
    }
}

fn validate_device_name(name: &str) -> Result<(), AppError> {
    if name.trim().is_empty() {
        return Err(AppError::new(codes::FILES_EMPTY_NAME));
    }
    if name == "." || name == ".." || name.contains('/') || name.contains('\0') {
        return Err(AppError::new(codes::FILES_INVALID_NAME));
    }
    Ok(())
}

fn device_parent_path(path: &str) -> Option<String> {
    if path == "/" {
        return None;
    }
    let parent = path
        .rsplit_once('/')
        .map(|(parent, _)| parent)
        .unwrap_or("");
    Some(if parent.is_empty() { "/" } else { parent }.to_string())
}

fn device_file_name(path: &str) -> Result<String, AppError> {
    path.rsplit('/')
        .next()
        .filter(|name| !name.is_empty())
        .map(ToString::to_string)
        .ok_or_else(|| AppError::new(codes::FILES_DEVICE_NAME_UNAVAILABLE).param("path", path))
}

fn join_device_path(parent: &str, name: &str) -> String {
    if parent == "/" {
        format!("/{name}")
    } else {
        format!("{parent}/{name}")
    }
}

pub(super) fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\"'\"'"))
}

fn shell_script_command(script: &str, argument: &str) -> String {
    format!("sh -c {} sh {}", shell_quote(script), shell_quote(argument))
}

fn find_available_remote_path(
    app: &AppHandle,
    serial: &str,
    remote_dir: &str,
    original_name: &str,
) -> Result<(String, String), AppError> {
    for index in 0..MAX_AUTORENAME_ATTEMPTS {
        let name = numbered_file_name(original_name, index);
        let path = join_device_path(remote_dir, &name);
        if !remote_path_exists(app, serial, &path)? {
            return Ok((name, path));
        }
    }

    Err(AppError::new(codes::FILES_UNIQUE_REMOTE_NAME_FAILED).param("name", original_name))
}

fn validate_remote_upload_directory(
    app: &AppHandle,
    serial: &str,
    remote_dir: &str,
) -> Result<(), AppError> {
    let quoted = shell_quote(remote_dir);
    let command = format!(
        "if [ ! -d {quoted} ]; then exit {NOT_DIRECTORY_EXIT}; fi; \
         if [ ! -x {quoted} ]; then exit {DIRECTORY_PERMISSION_EXIT}; fi"
    );
    let output = run_adb_output_with_serial(app, serial, &["shell", &command])
        .map_err(|error| AppError::new(codes::FILES_CHECK_UPLOAD_DIRECTORY).cause(error))?;
    check_file_output(&output, remote_dir)
}

fn numbered_file_name(original_name: &str, index: usize) -> String {
    if index == 0 {
        return original_name.to_string();
    }

    if let Some(dot_index) = original_name.rfind('.') {
        if dot_index > 0 && dot_index + 1 < original_name.len() {
            let (stem, extension) = original_name.split_at(dot_index);
            return format!("{stem} ({index}){extension}");
        }
    }
    format!("{original_name} ({index})")
}

fn remote_path_exists(app: &AppHandle, serial: &str, path: &str) -> Result<bool, AppError> {
    let quoted = shell_quote(path);
    let command = format!("[ -e {quoted} ] || [ -L {quoted} ]");
    let output = run_adb_output_with_serial(app, serial, &["shell", &command])?;
    if output.status.success() {
        return Ok(true);
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if output.status.code() == Some(1) && stderr.is_empty() {
        Ok(false)
    } else if stderr.is_empty() {
        Err(AppError::new(codes::FILES_EXISTS_FAILED).detail(output.status.to_string()))
    } else {
        Err(AppError::new(codes::FILES_EXISTS_FAILED).detail(stderr))
    }
}

pub(super) fn remote_file_size(app: &AppHandle, serial: &str, path: &str) -> Result<u64, AppError> {
    let quoted = shell_quote(path);
    let command =
        format!("if [ ! -f {quoted} ]; then exit {NOT_FILE_EXIT}; fi; stat -c %s {quoted}");
    let output = run_adb_output_with_serial(app, serial, &["shell", &command])
        .map_err(|error| AppError::new(codes::FILES_REMOTE_SIZE_FAILED).cause(error))?;
    check_file_output(&output, path)?;
    String::from_utf8_lossy(&output.stdout)
        .trim()
        .parse::<u64>()
        .map_err(|error| AppError::new(codes::FILES_INVALID_SIZE).detail(error.to_string()))
}

fn check_file_output(output: &std::process::Output, path: &str) -> Result<(), AppError> {
    if output.status.success() {
        return Ok(());
    }
    let code = match output.status.code() {
        Some(NOT_DIRECTORY_EXIT) => codes::FILES_NOT_DIRECTORY,
        Some(DIRECTORY_PERMISSION_EXIT) => codes::FILES_DIRECTORY_PERMISSION,
        Some(NOT_FILE_EXIT) => codes::FILES_NOT_FILE,
        _ => return Err(super::device::adb_output_error(output)),
    };
    Err(AppError::new(code)
        .param("path", path)
        .detail(String::from_utf8_lossy(&output.stderr).trim().to_string()))
}

fn preview_read_command(path: &str) -> String {
    format!(
        "head -c {MAX_IMAGE_PREVIEW_READ_BYTES} {}",
        shell_quote(path)
    )
}

pub(super) fn validate_download_target(target: &Path) -> Result<(), AppError> {
    if !target.is_absolute() {
        return Err(AppError::new(codes::FILES_ABSOLUTE_SAVE_PATH));
    }
    if target.file_name().is_none() {
        return Err(AppError::new(codes::FILES_MISSING_SAVE_NAME));
    }
    let parent = target
        .parent()
        .ok_or_else(|| AppError::new(codes::FILES_MISSING_SAVE_PARENT))?;
    if !parent.is_dir() {
        return Err(AppError::new(codes::FILES_SAVE_PARENT_MISSING));
    }
    if fs::symlink_metadata(target)
        .map(|metadata| metadata.file_type().is_dir())
        .unwrap_or(false)
    {
        return Err(AppError::new(codes::FILES_SAVE_PATH_DIRECTORY));
    }
    Ok(())
}

fn reserve_sibling_file(target: &Path, label: &str) -> Result<PathBuf, AppError> {
    let parent = target
        .parent()
        .ok_or_else(|| AppError::new(codes::FILES_MISSING_SAVE_PARENT))?;
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| AppError::new(codes::FILES_CLOCK_FAILED).detail(error.to_string()))?
        .as_nanos();

    for attempt in 0..1000 {
        let candidate = parent.join(format!(
            ".adb-gui-{label}-{}-{timestamp}-{attempt}.tmp",
            std::process::id()
        ));
        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&candidate)
        {
            Ok(_) => return Ok(candidate),
            Err(error) if error.kind() == ErrorKind::AlreadyExists => continue,
            Err(error) => {
                return Err(AppError::new(codes::FILES_CREATE_TEMP_FAILED).detail(error.to_string()))
            }
        }
    }

    Err(AppError::new(codes::FILES_UNIQUE_TEMP_FAILED))
}

fn unused_sibling_path(target: &Path, label: &str) -> Result<PathBuf, AppError> {
    let parent = target
        .parent()
        .ok_or_else(|| AppError::new(codes::FILES_MISSING_SAVE_PARENT))?;
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| AppError::new(codes::FILES_CLOCK_FAILED).detail(error.to_string()))?
        .as_nanos();

    for attempt in 0..1000 {
        let candidate = parent.join(format!(
            ".adb-gui-{label}-{}-{timestamp}-{attempt}.bak",
            std::process::id()
        ));
        match fs::symlink_metadata(&candidate) {
            Ok(_) => continue,
            Err(error) if error.kind() == ErrorKind::NotFound => return Ok(candidate),
            Err(error) => {
                return Err(
                    AppError::new(codes::FILES_INSPECT_BACKUP_FAILED).detail(error.to_string())
                )
            }
        }
    }

    Err(AppError::new(codes::FILES_UNIQUE_BACKUP_FAILED))
}

fn replace_download_target(temp_path: &Path, target: &Path) -> Result<(), AppError> {
    let target_exists = match fs::symlink_metadata(target) {
        Ok(_) => true,
        Err(error) if error.kind() == ErrorKind::NotFound => false,
        Err(error) => {
            return Err(AppError::new(codes::FILES_INSPECT_TARGET_FAILED).detail(error.to_string()))
        }
    };

    if !target_exists {
        return fs::rename(temp_path, target)
            .map_err(|error| AppError::new(codes::FILES_SAVE_FAILED).detail(error.to_string()));
    }

    let backup_path = unused_sibling_path(target, "backup")?;
    fs::rename(target, &backup_path)
        .map_err(|error| AppError::new(codes::FILES_BACKUP_FAILED).detail(error.to_string()))?;

    if let Err(error) = fs::rename(temp_path, target) {
        return match fs::rename(&backup_path, target) {
            Ok(_) => Err(AppError::new(codes::FILES_SAVE_RESTORED).detail(error.to_string())),
            Err(restore_error) => Err(AppError::new(codes::FILES_RESTORE_FAILED)
                .param("path", backup_path.to_string_lossy().into_owned())
                .detail(format!("{error}; {restore_error}"))),
        };
    }

    if let Err(error) = fs::remove_file(&backup_path) {
        eprintln!(
            "failed to remove replaced download backup {}: {error}",
            backup_path.to_string_lossy()
        );
    }
    Ok(())
}

fn remove_file_if_present(path: &Path) {
    if let Err(error) = fs::remove_file(path) {
        if error.kind() != ErrorKind::NotFound {
            eprintln!(
                "failed to remove device file transfer temp {}: {error}",
                path.to_string_lossy()
            );
        }
    }
}

fn detect_image_mime(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some("image/png")
    } else if bytes.starts_with(b"\xff\xd8\xff") {
        Some("image/jpeg")
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        Some("image/gif")
    } else if bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP" {
        Some("image/webp")
    } else {
        None
    }
}

fn is_previewable_name(name: &str) -> bool {
    name.rsplit_once('.')
        .map(|(_, extension)| {
            matches!(
                extension.to_ascii_lowercase().as_str(),
                "png" | "jpg" | "jpeg" | "webp" | "gif"
            )
        })
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    #[cfg(unix)]
    #[test]
    fn upload_preserves_offline_transport_failure_as_a_structured_cause() {
        use std::os::unix::process::ExitStatusExt;

        let Err(error) = super::push_device_file_with(
            "photo.png".to_string(),
            "/sdcard/Download/photo.png".to_string(),
            "/tmp/photo.png".to_string(),
            |args| {
                assert_eq!(
                    args,
                    ["push", "/tmp/photo.png", "/sdcard/Download/photo.png"]
                );
                let output = std::process::Output {
                    status: std::process::ExitStatus::from_raw(1 << 8),
                    stdout: Vec::new(),
                    stderr: b"error: device offline\n".to_vec(),
                };
                Err(crate::commands::device::adb_output_error(&output))
            },
        ) else {
            panic!("an offline push must not report a completed transfer");
        };

        assert_eq!(
            serde_json::to_value(error).unwrap(),
            serde_json::json!({
                "code": "files.uploadFailed",
                "causes": [{
                    "code": "adb.commandFailed",
                    "params": { "status": "exit status: 1" },
                    "detail": "error: device offline"
                }]
            })
        );
    }

    #[test]
    fn preview_rejects_oversized_metadata_before_reading() {
        let expected_size = MAX_IMAGE_PREVIEW_BYTES + 1;
        let Err(error) = super::read_image_preview_with("/sdcard/photo.png", expected_size, |_| {
            panic!("oversized metadata must prevent reading image data")
        }) else {
            panic!("an oversized image must not return a preview");
        };

        assert_eq!(
            serde_json::to_value(error).unwrap(),
            serde_json::json!({
                "code": "files.previewTooLarge",
                "params": { "bytes": expected_size }
            })
        );
    }

    #[test]
    fn preview_rejects_actual_bytes_above_limit_when_metadata_was_within_limit() {
        let actual_size = MAX_IMAGE_PREVIEW_BYTES + 1;
        let Err(error) =
            super::read_image_preview_with("/sdcard/photo.png", MAX_IMAGE_PREVIEW_BYTES, |args| {
                assert_eq!(args, ["exec-out", "head -c 20971521 '/sdcard/photo.png'"]);
                Ok(vec![0; actual_size as usize])
            })
        else {
            panic!("an image that grows past the limit must not return a preview");
        };

        assert_eq!(
            serde_json::to_value(error).unwrap(),
            serde_json::json!({
                "code": "files.previewReadTooLarge",
                "params": { "bytes": actual_size }
            })
        );
    }

    #[cfg(unix)]
    #[test]
    fn maps_private_shell_statuses_without_parsing_user_paths_or_tool_text() {
        use super::{
            check_file_output, DIRECTORY_PERMISSION_EXIT, NOT_DIRECTORY_EXIT, NOT_FILE_EXIT,
        };
        use crate::error_codes as codes;
        use std::os::unix::process::ExitStatusExt;

        let path = "/sdcard/a file\npermission denied";
        for (status, code) in [
            (NOT_DIRECTORY_EXIT, codes::FILES_NOT_DIRECTORY),
            (DIRECTORY_PERMISSION_EXIT, codes::FILES_DIRECTORY_PERMISSION),
            (NOT_FILE_EXIT, codes::FILES_NOT_FILE),
        ] {
            let output = std::process::Output {
                status: std::process::ExitStatus::from_raw(status << 8),
                stdout: Vec::new(),
                stderr: b"raw device diagnostic".to_vec(),
            };
            let error = check_file_output(&output, path).unwrap_err();
            assert_eq!(error.code, code);
            assert_eq!(error.params["path"], path.into());
            assert_eq!(error.detail.as_deref(), Some("raw device diagnostic"));
        }
        let transport = std::process::Output {
            status: std::process::ExitStatus::from_raw(1 << 8),
            stdout: Vec::new(),
            stderr: b"error: device offline".to_vec(),
        };
        let error = check_file_output(&transport, path).unwrap_err();
        assert_eq!(error.code, codes::ADB_COMMAND_FAILED);
        assert_eq!(error.detail.as_deref(), Some("error: device offline"));
    }

    #[cfg(unix)]
    #[test]
    fn directory_script_reports_missing_paths_with_its_private_status() {
        use super::{list_directory_script, NOT_DIRECTORY_EXIT};
        let root = tempfile::tempdir().unwrap();
        let missing = root.path().join("missing ' folder");
        let output = std::process::Command::new("/bin/sh")
            .args(["-c", &list_directory_script(), "sh"])
            .arg(&missing)
            .output()
            .unwrap();
        assert_eq!(output.status.code(), Some(NOT_DIRECTORY_EXIT));
        assert!(output.stdout.is_empty());
        assert!(output.stderr.is_empty());
    }

    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::{
        detect_image_mime, device_parent_path, is_previewable_name, normalize_device_path,
        numbered_file_name, parse_directory_records, preview_read_command, replace_download_target,
        shell_quote, validate_device_name, validate_download_target, DeviceFileKind,
        MAX_IMAGE_PREVIEW_BYTES,
    };

    #[test]
    fn normalizes_absolute_device_paths() {
        assert_eq!(
            normalize_device_path("/sdcard//Download/./images").as_deref(),
            Ok("/sdcard/Download/images")
        );
        assert_eq!(
            normalize_device_path("/sdcard/Download/../Pictures").as_deref(),
            Ok("/sdcard/Pictures")
        );
        assert_eq!(normalize_device_path("/").as_deref(), Ok("/"));
        assert!(normalize_device_path("relative/path").is_err());
        assert!(normalize_device_path("/../data").is_err());
    }

    #[test]
    fn calculates_device_parent_paths() {
        assert_eq!(device_parent_path("/"), None);
        assert_eq!(device_parent_path("/sdcard").as_deref(), Some("/"));
        assert_eq!(
            device_parent_path("/sdcard/Download").as_deref(),
            Some("/sdcard")
        );
    }

    #[test]
    fn validates_single_device_name_segment() {
        assert!(validate_device_name("中文 folder").is_ok());
        assert!(validate_device_name("").is_err());
        assert!(validate_device_name("   ").is_err());
        assert!(validate_device_name("..").is_err());
        assert!(validate_device_name("a/b").is_err());
    }

    #[test]
    fn quotes_posix_shell_arguments() {
        assert_eq!(shell_quote("plain path"), "'plain path'");
        assert_eq!(shell_quote("a'b"), "'a'\"'\"'b'");
    }

    #[test]
    fn parses_nul_delimited_directory_records_in_source_order() {
        let output = concat!(
            "81a4 4 1700000000\n41ed 4096 1700000001\n81a4 8 1700000002\n\0",
            "/sdcard/Download/z file.txt\0",
            "/sdcard/Download/图片\0",
            "/sdcard/Download/.hidden\0"
        );

        let entries = parse_directory_records(output.as_bytes(), "/sdcard/Download").unwrap();
        assert_eq!(entries.len(), 3);
        assert_eq!(entries[0].name, "z file.txt");
        assert!(!entries[0].previewable);
        assert_eq!(entries[1].name, "图片");
        assert_eq!(entries[1].kind, DeviceFileKind::Directory);
        assert_eq!(entries[2].name, ".hidden");
    }

    #[test]
    fn rejects_malformed_or_out_of_scope_directory_records() {
        for output in [
            &b"81a4 1 1\n\0/sdcard/Pictures/photo.png\0"[..],
            b"81a4 1 1\n\0",
            b"81a4 1 1\n81a4 2 2\n\0/sdcard/Download/a\0",
            b"81a4 1 1\n\0/sdcard/Download/a\0/sdcard/Download/b\0",
            b"\0",
            b"81a4 1 1\0/sdcard/Download/a\0",
            b"81a4 1\n\0/sdcard/Download/a\0",
            b"invalid 1 1\n\0/sdcard/Download/a\0",
            b"0 1 1\n\0/sdcard/Download/a\0",
            b"81a4 -1 1\n\0/sdcard/Download/a\0",
            b"81a4 1 invalid\n\0/sdcard/Download/a\0",
            b"81a4 1 1\n\0/sdcard/Download/\xff\0",
        ] {
            assert!(parse_directory_records(output, "/sdcard/Download").is_err());
        }
    }

    #[test]
    fn tolerates_only_trailing_line_endings_after_directory_records() {
        let output = b"81a4 1 1\n\0/sdcard/Download/photo.png\0\r\n";
        let entries = parse_directory_records(output, "/sdcard/Download").unwrap();

        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "photo.png");
        assert!(parse_directory_records(b"\r\n", "/sdcard/Download")
            .unwrap()
            .is_empty());
        assert!(parse_directory_records(
            b"81a4 1 1\n\0/sdcard/Download/photo.png\0 ",
            "/sdcard/Download"
        )
        .is_err());
    }

    #[test]
    fn batch_protocol_failures_preserve_structured_error_codes() {
        use crate::error_codes as codes;
        for (output, code) in [
            (&b"\xff\0"[..], codes::FILES_METADATA_NOT_UTF8),
            (&b"81a4 1 1\0"[..], codes::FILES_INVALID_BATCH_METADATA),
            (&b"81a4 1 1\n\0"[..], codes::FILES_MISSING_BATCH_PATH),
            (
                &b"invalid 1 1\n\0/sdcard/Download/file\0"[..],
                codes::FILES_INVALID_MODE,
            ),
        ] {
            let error = parse_directory_records(output, "/sdcard/Download").unwrap_err();
            assert_eq!(error.code, code);
            assert_eq!(serde_json::to_value(error).unwrap()["code"], code);
        }
        let error =
            parse_directory_records(b"81a4 1\n\0/sdcard/Download/file\0", "/sdcard/Download")
                .unwrap_err();
        let payload = serde_json::to_value(error).unwrap();
        assert_eq!(payload["code"], codes::FILES_INVALID_FIELD_COUNT);
        assert_eq!(payload["params"]["count"], 2);
    }

    #[test]
    fn parses_multiple_batches_with_special_names_and_wide_metadata() {
        let output = concat!(
            "81a4 5368709120 -1\na1ff 7 1700000000\n\0",
            "/sdcard/Download/空 格'\"\t\r\n.png\0",
            "/sdcard/Download/broken-link\0",
            "11a4 0 1700000001\n\0/sdcard/Download/pipe\0"
        );
        let entries = parse_directory_records(output.as_bytes(), "/sdcard/Download").unwrap();
        assert_eq!(entries.len(), 3);
        assert_eq!(entries[0].name, "空 格'\"\t\r\n.png");
        assert_eq!(entries[0].size, 5 * 1024 * 1024 * 1024);
        assert_eq!(entries[0].modified_at, -1);
        assert!(entries[0].previewable);
        assert_eq!(entries[1].kind, DeviceFileKind::Symlink);
        assert!(!entries[1].previewable);
        assert_eq!(entries[2].kind, DeviceFileKind::Other);
    }

    #[cfg(unix)]
    #[test]
    fn directory_script_batches_paths_and_preserves_shell_arguments() {
        use std::os::unix::fs::symlink;
        let root = tempfile::tempdir().unwrap();
        let directory = root.path().join("files ' quoted");
        fs::create_dir(&directory).unwrap();
        let log = root.path().join("batches");
        // Stand in for Android stat on macOS. Log actual argv sizes to catch a
        // regression to per-file calls or unbounded argument lists.
        let script = format!(
            r#"stat() {{
  shift 2
  bytes=0
  for path do bytes=$((bytes + ${{#path}} + 1)); done
  printf '%s %s\n' "$#" "$bytes" >> "$BATCH_LOG"
  for path do printf '81a4 4 1700000000\n'; done
}}
{}"#,
            super::list_directory_script()
        );
        let run = || {
            std::process::Command::new("/bin/sh")
                .args(["-c", &script, "sh"])
                .arg(&directory)
                .env("BATCH_LOG", &log)
                .output()
                .unwrap()
        };
        let empty = run();
        assert!(empty.status.success());
        assert!(empty.stdout.is_empty());
        assert!(!log.exists());

        let mut names = vec![
            ".hidden".to_string(),
            "..hidden".to_string(),
            "空 格'\"\t\r\n".to_string(),
        ];
        names.extend((0..300).map(|i| format!("file-{i:03}")));
        names.extend((0..150).map(|i| format!("long-{i:03}-{}", "x".repeat(220))));
        for name in &names {
            fs::write(directory.join(name), b"data").unwrap();
        }
        symlink("missing-target", directory.join("broken-link")).unwrap();
        names.push("broken-link".to_string());

        let output = run();
        assert!(output.status.success(), "{:?}", output.stderr);
        let entries = parse_directory_records(&output.stdout, directory.to_str().unwrap()).unwrap();
        let mut actual: Vec<_> = entries.into_iter().map(|entry| entry.name).collect();
        actual.sort();
        names.sort();
        assert_eq!(actual, names);
        let batches = fs::read_to_string(log).unwrap();
        let batches: Vec<_> = batches
            .lines()
            .map(|line| {
                line.split_whitespace()
                    .map(|n| n.parse::<usize>().unwrap())
                    .collect::<Vec<_>>()
            })
            .collect();
        assert!(batches.len() < 10);
        assert!(batches.iter().any(|batch| batch[0] == 128));
        assert!(batches
            .iter()
            .any(|batch| batch[0] < 128 && batch[1] >= 16384));
        assert!(batches
            .iter()
            .all(|batch| batch[0] <= 128 && batch[1] < 16384 + 4096));
    }

    #[cfg(unix)]
    #[test]
    fn directory_script_propagates_stat_and_missing_directory_failures() {
        let root = tempfile::tempdir().unwrap();
        fs::write(root.path().join("file"), b"data").unwrap();
        let script = format!(
            "stat() {{ echo 'stat failed' >&2; return 7; }}\n{}",
            super::list_directory_script()
        );
        for (path, status) in [
            (root.path().to_path_buf(), 3),
            (root.path().join("missing"), super::NOT_DIRECTORY_EXIT),
        ] {
            let output = std::process::Command::new("/bin/sh")
                .args(["-c", &script, "sh"])
                .arg(path)
                .output()
                .unwrap();
            assert_eq!(output.status.code(), Some(status));
            assert!(output.stdout.is_empty());
            if status == 3 {
                assert!(!output.stderr.is_empty());
            }
        }
    }

    #[test]
    fn numbers_file_names_before_the_extension() {
        assert_eq!(numbered_file_name("photo.jpg", 0), "photo.jpg");
        assert_eq!(numbered_file_name("photo.jpg", 1), "photo (1).jpg");
        assert_eq!(
            numbered_file_name("archive.tar.gz", 2),
            "archive.tar (2).gz"
        );
        assert_eq!(numbered_file_name("README", 3), "README (3)");
        assert_eq!(numbered_file_name(".env", 1), ".env (1)");
    }

    #[test]
    fn recognizes_supported_image_magic_bytes() {
        assert_eq!(
            detect_image_mime(b"\x89PNG\r\n\x1a\nrest"),
            Some("image/png")
        );
        assert_eq!(detect_image_mime(b"\xff\xd8\xffrest"), Some("image/jpeg"));
        assert_eq!(detect_image_mime(b"GIF89arest"), Some("image/gif"));
        assert_eq!(
            detect_image_mime(b"RIFF\x04\0\0\0WEBPrest"),
            Some("image/webp")
        );
        assert_eq!(detect_image_mime(b"not an image"), None);
    }

    #[test]
    fn caps_preview_output_on_the_device_before_reading() {
        assert_eq!(
            preview_read_command("/sdcard/Download/a'b.png"),
            format!(
                "head -c {} '/sdcard/Download/a'\"'\"'b.png'",
                MAX_IMAGE_PREVIEW_BYTES + 1
            )
        );
    }

    #[test]
    fn marks_supported_image_extensions_as_previewable() {
        assert!(is_previewable_name("photo.JPEG"));
        assert!(is_previewable_name("animation.gif"));
        assert!(!is_previewable_name("notes.txt"));
        assert!(!is_previewable_name("png"));
    }

    #[test]
    fn validates_and_replaces_download_targets() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let directory = std::env::temp_dir().join(format!(
            "adb-gui-device-files-{}-{unique}",
            std::process::id()
        ));
        fs::create_dir(&directory).unwrap();

        let target = directory.join("download.txt");
        assert!(validate_download_target(&target).is_ok());
        assert!(validate_download_target(&directory).is_err());
        assert!(validate_download_target(&directory.join("missing").join("file.txt")).is_err());

        let first_temp = directory.join("first.tmp");
        fs::write(&first_temp, b"first").unwrap();
        replace_download_target(&first_temp, &target).unwrap();
        assert_eq!(fs::read(&target).unwrap(), b"first");

        let second_temp = directory.join("second.tmp");
        fs::write(&second_temp, b"second").unwrap();
        replace_download_target(&second_temp, &target).unwrap();
        assert_eq!(fs::read(&target).unwrap(), b"second");
        assert_eq!(fs::read_dir(&directory).unwrap().count(), 1);

        fs::remove_dir_all(directory).unwrap();
    }
}
