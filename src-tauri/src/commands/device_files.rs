use std::cmp::Ordering;
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

const LIST_DIRECTORY_SCRIPT: &str = r#"target=$1
if [ ! -d "$target" ]; then
  echo "路径不是可访问目录: $target" >&2
  exit 2
fi
if [ ! -r "$target" ] || [ ! -x "$target" ]; then
  echo "没有权限读取设备目录: $target" >&2
  exit 2
fi
prefix=$target
if [ "$prefix" = "/" ]; then
  prefix=""
fi
for item in "$prefix"/* "$prefix"/.[!.]* "$prefix"/..?*; do
  if [ ! -e "$item" ] && [ ! -L "$item" ]; then
    continue
  fi
  if [ -L "$item" ]; then
    kind=symlink
  elif [ -d "$item" ]; then
    kind=directory
  elif [ -f "$item" ]; then
    kind=file
  else
    kind=other
  fi
  size=$(stat -c %s "$item") || exit 3
  modified=$(stat -c %Y "$item") || exit 3
  printf '%s\000%s\000%s\000%s\000' "$kind" "$size" "$modified" "$item"
done"#;

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
) -> Result<DeviceDirectoryListing, String> {
    let path = normalize_device_path(path.as_deref().unwrap_or(DEFAULT_DEVICE_DIRECTORY))?;
    tauri::async_runtime::spawn_blocking(move || list_directory(&app, &serial, &path))
        .await
        .map_err(|error| format!("读取设备目录任务失败: {error}"))?
}

#[tauri::command]
pub async fn create_device_directory(
    app: AppHandle,
    serial: String,
    parent_path: String,
    name: String,
) -> Result<DeviceFileEntry, String> {
    let parent_path = normalize_device_path(&parent_path)?;
    validate_device_name(&name)?;

    tauri::async_runtime::spawn_blocking(move || {
        let path = join_device_path(&parent_path, &name);
        let command = format!("mkdir {}", shell_quote(&path));
        run_adb_with_serial(&app, &serial, &["shell", &command])
            .map_err(|error| format!("新建设备目录失败: {error}"))?;

        list_directory(&app, &serial, &parent_path)?
            .entries
            .into_iter()
            .find(|entry| entry.path == path)
            .ok_or_else(|| "目录已创建, 但无法从设备目录中读取".to_string())
    })
    .await
    .map_err(|error| format!("新建设备目录任务失败: {error}"))?
}

#[tauri::command]
pub async fn upload_device_file(
    app: AppHandle,
    serial: String,
    local_path: String,
    remote_dir: String,
) -> Result<DeviceTransferResult, String> {
    let remote_dir = normalize_device_path(&remote_dir)?;

    tauri::async_runtime::spawn_blocking(move || {
        let local = Path::new(&local_path);
        let metadata = fs::metadata(local).map_err(|error| format!("读取本地文件失败: {error}"))?;
        if !metadata.is_file() {
            return Err("只支持上传普通文件, 不支持目录".to_string());
        }

        let original_name = local
            .file_name()
            .and_then(|name| name.to_str())
            .filter(|name| !name.is_empty())
            .ok_or_else(|| "无法读取本地文件名".to_string())?;
        validate_device_name(original_name)?;

        validate_remote_upload_directory(&app, &serial, &remote_dir)?;
        let (name, remote_path) =
            find_available_remote_path(&app, &serial, &remote_dir, original_name)?;

        run_adb_with_serial(&app, &serial, &["push", &local_path, &remote_path])
            .map_err(|error| format!("上传文件到设备失败: {error}"))?;

        Ok(DeviceTransferResult {
            name,
            remote_path,
            local_path: Some(local_path),
        })
    })
    .await
    .map_err(|error| format!("上传文件任务失败: {error}"))?
}

#[tauri::command]
pub async fn download_device_file(
    app: AppHandle,
    serial: String,
    remote_path: String,
    local_path: String,
) -> Result<DeviceTransferResult, String> {
    let remote_path = normalize_device_path(&remote_path)?;

    tauri::async_runtime::spawn_blocking(move || {
        let remote_size = remote_file_size(&app, &serial, &remote_path)?;
        let target = PathBuf::from(&local_path);
        validate_download_target(&target)?;
        let temp_path = reserve_sibling_file(&target, "download")?;

        let result = (|| {
            let temp_path_string = temp_path.to_string_lossy().to_string();
            run_adb_with_serial(&app, &serial, &["pull", &remote_path, &temp_path_string])
                .map_err(|error| format!("从设备下载文件失败: {error}"))?;

            let local_size = fs::metadata(&temp_path)
                .map_err(|error| format!("读取下载临时文件失败: {error}"))?
                .len();
            if local_size != remote_size {
                return Err(format!(
                    "下载文件大小不一致: 设备端 {remote_size} 字节, 本地 {local_size} 字节"
                ));
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
            .ok_or_else(|| "无法读取本地保存文件名".to_string())?
            .to_string();

        Ok(DeviceTransferResult {
            name,
            remote_path,
            local_path: Some(local_path),
        })
    })
    .await
    .map_err(|error| format!("下载文件任务失败: {error}"))?
}

#[tauri::command]
pub async fn preview_device_image(
    app: AppHandle,
    serial: String,
    remote_path: String,
) -> Result<DeviceImagePreview, String> {
    let remote_path = normalize_device_path(&remote_path)?;

    tauri::async_runtime::spawn_blocking(move || {
        let expected_size = remote_file_size(&app, &serial, &remote_path)?;
        if expected_size > MAX_IMAGE_PREVIEW_BYTES {
            return Err(format!("图片超过 20 MiB 预览上限: {expected_size} 字节"));
        }

        let command = preview_read_command(&remote_path);
        let bytes = run_adb_bytes_with_serial(&app, &serial, &["exec-out", &command])
            .map_err(|error| format!("读取设备图片失败: {error}"))?;
        let actual_size = bytes.len() as u64;
        if actual_size > MAX_IMAGE_PREVIEW_BYTES {
            return Err(format!(
                "图片读取结果超过 20 MiB 预览上限: {actual_size} 字节"
            ));
        }
        if actual_size != expected_size {
            return Err(format!(
                "图片读取不完整: 设备端 {expected_size} 字节, 实际读取 {actual_size} 字节"
            ));
        }

        let mime_type = detect_image_mime(&bytes)
            .ok_or_else(|| "仅支持预览 PNG、JPEG、WEBP 和 GIF 图片".to_string())?;
        let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);

        Ok(DeviceImagePreview {
            data_url: format!("data:{mime_type};base64,{encoded}"),
            mime_type: mime_type.to_string(),
            size: actual_size,
        })
    })
    .await
    .map_err(|error| format!("读取图片预览任务失败: {error}"))?
}

fn list_directory(
    app: &AppHandle,
    serial: &str,
    path: &str,
) -> Result<DeviceDirectoryListing, String> {
    let command = shell_script_command(LIST_DIRECTORY_SCRIPT, path);
    let output = run_adb_bytes_with_serial(app, serial, &["exec-out", &command])
        .map_err(|error| format!("读取设备目录失败: {error}"))?;
    let entries = parse_directory_records(&output, path)?;

    Ok(DeviceDirectoryListing {
        path: path.to_string(),
        parent: device_parent_path(path),
        entries,
    })
}

fn parse_directory_records(output: &[u8], directory: &str) -> Result<Vec<DeviceFileEntry>, String> {
    let output = trim_protocol_line_endings(output);
    if output.is_empty() {
        return Ok(Vec::new());
    }
    if output.last() != Some(&0) {
        return Err("设备目录记录缺少结束分隔符".to_string());
    }

    let mut fields: Vec<&[u8]> = output.split(|byte| *byte == 0).collect();
    fields.pop();
    if !fields.len().is_multiple_of(4) {
        return Err(format!("设备目录记录字段数量无效: {}", fields.len()));
    }

    let mut entries = Vec::with_capacity(fields.len() / 4);
    for record in fields.chunks_exact(4) {
        let kind = match utf8_field(record[0], "类型")? {
            "directory" => DeviceFileKind::Directory,
            "file" => DeviceFileKind::File,
            "symlink" => DeviceFileKind::Symlink,
            "other" => DeviceFileKind::Other,
            value => return Err(format!("未知设备文件类型: {value}")),
        };
        let size = utf8_field(record[1], "大小")?
            .parse::<u64>()
            .map_err(|error| format!("设备文件大小无效: {error}"))?;
        let modified_at = utf8_field(record[2], "修改时间")?
            .parse::<i64>()
            .map_err(|error| format!("设备文件修改时间无效: {error}"))?;
        let path = normalize_device_path(utf8_field(record[3], "路径")?)?;

        if device_parent_path(&path).as_deref() != Some(directory) {
            return Err(format!("设备返回了目录范围外的路径: {path}"));
        }
        let name = device_file_name(&path)?;
        let previewable = matches!(kind, DeviceFileKind::File) && is_previewable_name(&name);
        entries.push(DeviceFileEntry {
            name,
            path,
            kind,
            size,
            modified_at,
            previewable,
        });
    }

    entries.sort_by(compare_entries);
    Ok(entries)
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

fn compare_entries(left: &DeviceFileEntry, right: &DeviceFileEntry) -> Ordering {
    let left_directory = matches!(left.kind, DeviceFileKind::Directory);
    let right_directory = matches!(right.kind, DeviceFileKind::Directory);
    right_directory
        .cmp(&left_directory)
        .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
        .then_with(|| left.name.cmp(&right.name))
}

fn utf8_field<'a>(value: &'a [u8], label: &str) -> Result<&'a str, String> {
    std::str::from_utf8(value).map_err(|error| format!("设备文件{label}不是 UTF-8: {error}"))
}

fn normalize_device_path(path: &str) -> Result<String, String> {
    if path.is_empty() || !path.starts_with('/') {
        return Err("设备路径必须是以 / 开头的绝对路径".to_string());
    }
    if path.contains('\0') {
        return Err("设备路径不能包含 NUL".to_string());
    }

    let mut segments = Vec::new();
    for segment in path.split('/') {
        match segment {
            "" | "." => {}
            ".." => {
                if segments.pop().is_none() {
                    return Err("设备路径不能越过根目录".to_string());
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

fn validate_device_name(name: &str) -> Result<(), String> {
    if name.trim().is_empty() {
        return Err("名称不能为空".to_string());
    }
    if name == "." || name == ".." || name.contains('/') || name.contains('\0') {
        return Err("名称必须是单个有效路径段".to_string());
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

fn device_file_name(path: &str) -> Result<String, String> {
    path.rsplit('/')
        .next()
        .filter(|name| !name.is_empty())
        .map(ToString::to_string)
        .ok_or_else(|| format!("无法读取设备文件名: {path}"))
}

fn join_device_path(parent: &str, name: &str) -> String {
    if parent == "/" {
        format!("/{name}")
    } else {
        format!("{parent}/{name}")
    }
}

fn shell_quote(value: &str) -> String {
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
) -> Result<(String, String), String> {
    for index in 0..MAX_AUTORENAME_ATTEMPTS {
        let name = numbered_file_name(original_name, index);
        let path = join_device_path(remote_dir, &name);
        if !remote_path_exists(app, serial, &path)? {
            return Ok((name, path));
        }
    }

    Err(format!("无法为 {original_name} 生成不冲突的设备文件名"))
}

fn validate_remote_upload_directory(
    app: &AppHandle,
    serial: &str,
    remote_dir: &str,
) -> Result<(), String> {
    let quoted = shell_quote(remote_dir);
    let command = format!(
        "if [ ! -d {quoted} ]; then echo '上传目标不是设备目录' >&2; exit 2; fi; \
         if [ ! -x {quoted} ]; then echo '没有权限访问上传目标目录' >&2; exit 2; fi"
    );
    run_adb_with_serial(app, serial, &["shell", &command])
        .map(|_| ())
        .map_err(|error| format!("检查设备上传目录失败: {error}"))
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

fn remote_path_exists(app: &AppHandle, serial: &str, path: &str) -> Result<bool, String> {
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
        Err(format!("检查设备文件是否存在失败: {}", output.status))
    } else {
        Err(format!("检查设备文件是否存在失败: {stderr}"))
    }
}

fn remote_file_size(app: &AppHandle, serial: &str, path: &str) -> Result<u64, String> {
    let quoted = shell_quote(path);
    let command = format!(
        "if [ ! -f {quoted} ]; then echo '设备路径不是文件' >&2; exit 2; fi; stat -c %s {quoted}"
    );
    let output = run_adb_with_serial(app, serial, &["shell", &command])
        .map_err(|error| format!("读取设备文件大小失败: {error}"))?;
    output
        .trim()
        .parse::<u64>()
        .map_err(|error| format!("设备文件大小无效: {error}"))
}

fn preview_read_command(path: &str) -> String {
    format!(
        "head -c {MAX_IMAGE_PREVIEW_READ_BYTES} {}",
        shell_quote(path)
    )
}

fn validate_download_target(target: &Path) -> Result<(), String> {
    if !target.is_absolute() {
        return Err("本地保存路径必须是绝对路径".to_string());
    }
    if target.file_name().is_none() {
        return Err("本地保存路径缺少文件名".to_string());
    }
    let parent = target
        .parent()
        .ok_or_else(|| "本地保存路径缺少父目录".to_string())?;
    if !parent.is_dir() {
        return Err("本地保存目录不存在".to_string());
    }
    if fs::symlink_metadata(target)
        .map(|metadata| metadata.file_type().is_dir())
        .unwrap_or(false)
    {
        return Err("本地保存路径是目录".to_string());
    }
    Ok(())
}

fn reserve_sibling_file(target: &Path, label: &str) -> Result<PathBuf, String> {
    let parent = target
        .parent()
        .ok_or_else(|| "本地保存路径缺少父目录".to_string())?;
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("读取系统时间失败: {error}"))?
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
            Err(error) => return Err(format!("创建本地临时文件失败: {error}")),
        }
    }

    Err("无法创建唯一的本地临时文件".to_string())
}

fn unused_sibling_path(target: &Path, label: &str) -> Result<PathBuf, String> {
    let parent = target
        .parent()
        .ok_or_else(|| "本地保存路径缺少父目录".to_string())?;
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("读取系统时间失败: {error}"))?
        .as_nanos();

    for attempt in 0..1000 {
        let candidate = parent.join(format!(
            ".adb-gui-{label}-{}-{timestamp}-{attempt}.bak",
            std::process::id()
        ));
        match fs::symlink_metadata(&candidate) {
            Ok(_) => continue,
            Err(error) if error.kind() == ErrorKind::NotFound => return Ok(candidate),
            Err(error) => return Err(format!("检查本地备份路径失败: {error}")),
        }
    }

    Err("无法创建唯一的本地备份路径".to_string())
}

fn replace_download_target(temp_path: &Path, target: &Path) -> Result<(), String> {
    let target_exists = match fs::symlink_metadata(target) {
        Ok(_) => true,
        Err(error) if error.kind() == ErrorKind::NotFound => false,
        Err(error) => return Err(format!("检查本地目标文件失败: {error}")),
    };

    if !target_exists {
        return fs::rename(temp_path, target).map_err(|error| format!("保存下载文件失败: {error}"));
    }

    let backup_path = unused_sibling_path(target, "backup")?;
    fs::rename(target, &backup_path).map_err(|error| format!("备份已有本地文件失败: {error}"))?;

    if let Err(error) = fs::rename(temp_path, target) {
        return match fs::rename(&backup_path, target) {
            Ok(_) => Err(format!("保存下载文件失败, 已恢复原文件: {error}")),
            Err(restore_error) => Err(format!(
                "保存下载文件失败且无法恢复原文件: {error}; 备份位于 {}; 恢复错误: {restore_error}",
                backup_path.to_string_lossy()
            )),
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
    fn parses_and_sorts_nul_delimited_directory_records() {
        let output = concat!(
            "file\0",
            "4\0",
            "1700000000\0",
            "/sdcard/Download/z file.txt\0",
            "directory\0",
            "4096\0",
            "1700000001\0",
            "/sdcard/Download/图片\0",
            "file\0",
            "8\0",
            "1700000002\0",
            "/sdcard/Download/.hidden\0"
        );

        let entries = parse_directory_records(output.as_bytes(), "/sdcard/Download").unwrap();
        assert_eq!(entries.len(), 3);
        assert_eq!(entries[0].name, "图片");
        assert_eq!(entries[0].kind, DeviceFileKind::Directory);
        assert_eq!(entries[1].name, ".hidden");
        assert_eq!(entries[2].name, "z file.txt");
        assert!(!entries[2].previewable);
    }

    #[test]
    fn rejects_malformed_or_out_of_scope_directory_records() {
        assert!(parse_directory_records(b"file\0", "/sdcard/Download").is_err());
        let outside = b"file\0\x31\0\x31\0/sdcard/Pictures/photo.png\0";
        assert!(parse_directory_records(outside, "/sdcard/Download").is_err());
    }

    #[test]
    fn tolerates_only_trailing_line_endings_after_directory_records() {
        let output = b"file\0\x31\0\x31\0/sdcard/Download/photo.png\0\r\n";
        let entries = parse_directory_records(output, "/sdcard/Download").unwrap();

        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "photo.png");
        assert!(parse_directory_records(b"\r\n", "/sdcard/Download")
            .unwrap()
            .is_empty());
        assert!(parse_directory_records(
            b"file\0\x31\0\x31\0/sdcard/Download/photo.png\0 ",
            "/sdcard/Download"
        )
        .is_err());
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
