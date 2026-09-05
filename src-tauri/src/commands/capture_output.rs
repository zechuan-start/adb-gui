use serde::Deserialize;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use tempfile::NamedTempFile;

use super::device_files::validate_download_target;

#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum CaptureDestination {
    Default,
    Directory { path: String },
}

#[tauri::command]
pub fn resolve_capture_directory(destination: CaptureDestination) -> Result<String, String> {
    directory_path(&destination, dirs::picture_dir())
        .map(|path| path.to_string_lossy().into_owned())
}

fn directory_path(
    destination: &CaptureDestination,
    pictures: Option<PathBuf>,
) -> Result<PathBuf, String> {
    match destination {
        CaptureDestination::Default => pictures
            .map(|path| path.join("ADB GUI"))
            .ok_or_else(|| "无法解析系统图片目录, 请在设置中选择保存目录".to_string()),
        CaptureDestination::Directory { path } => {
            let path = PathBuf::from(path);
            if !path.is_absolute() {
                return Err("本机保存目录必须是绝对路径".to_string());
            }
            let metadata = fs::metadata(&path)
                .map_err(|error| format!("保存目录不可用 ({}): {error}", path.display()))?;
            if !metadata.is_dir() {
                return Err(format!("保存位置不是目录: {}", path.display()));
            }
            Ok(path)
        }
    }
}

pub(super) fn capture_target(
    destination: &CaptureDestination,
    serial: &str,
    id: &str,
    extension: &str,
) -> Result<PathBuf, String> {
    let directory = directory_path(destination, dirs::picture_dir())?;
    if matches!(destination, CaptureDestination::Default) {
        fs::create_dir_all(&directory)
            .map_err(|error| format!("创建默认保存目录失败 ({}): {error}", directory.display()))?;
    }
    let target = directory.join(format!("capture-{}-{id}.{extension}", safe_serial(serial)));
    let probe = CaptureOutput::new(&target)?;
    probe
        .file
        .close()
        .map_err(|error| format!("清理录制准备文件失败: {error}"))?;
    Ok(target)
}

pub(super) fn capture_id() -> Result<String, String> {
    static SEQUENCE: AtomicU64 = AtomicU64::new(1);
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("读取系统时间失败: {error}"))?
        .as_nanos();
    Ok(format!(
        "{}-{nanos}-{}",
        std::process::id(),
        SEQUENCE.fetch_add(1, Ordering::Relaxed)
    ))
}

fn safe_serial(serial: &str) -> String {
    serial
        .chars()
        .map(|value| {
            if value.is_control() || "/\\:*?\"<>| ".contains(value) {
                '_'
            } else {
                value
            }
        })
        .collect()
}

pub(super) struct CaptureOutput {
    file: NamedTempFile,
    target: PathBuf,
}

impl CaptureOutput {
    pub fn new(target: &Path) -> Result<Self, String> {
        validate_download_target(target)
            .map_err(|error| format!("准备保存失败 ({}): {error}", target.display()))?;
        let parent = target
            .parent()
            .ok_or_else(|| "保存路径缺少父目录".to_string())?;
        let file = tempfile::Builder::new()
            .prefix(".adb-gui-capture-")
            .tempfile_in(parent)
            .map_err(|error| format!("创建暂存文件失败 ({}): {error}", target.display()))?;
        Ok(Self {
            file,
            target: target.to_owned(),
        })
    }

    pub fn path(&self) -> &Path {
        self.file.path()
    }

    pub fn write(&mut self, bytes: &[u8]) -> Result<(), String> {
        self.file
            .write_all(bytes)
            .map_err(|error| format!("写入截图失败 ({}): {error}", self.target.display()))
    }

    pub fn verify_size(&self, expected: u64) -> Result<(), String> {
        let size = fs::metadata(self.path())
            .map_err(|error| format!("校验本机文件失败 ({}): {error}", self.target.display()))?
            .len();
        if expected == 0 || size != expected {
            return Err(format!(
                "校验文件完整性失败 ({}): 设备 {expected} 字节, 本机 {size} 字节",
                self.target.display()
            ));
        }
        Ok(())
    }

    pub fn publish(self, overwrite: bool) -> Result<(), String> {
        self.file
            .as_file()
            .sync_all()
            .map_err(|error| format!("同步本机文件失败 ({}): {error}", self.target.display()))?;
        let result = if overwrite {
            self.file.persist(&self.target)
        } else {
            self.file.persist_noclobber(&self.target)
        };
        result.map(|_| ()).map_err(|error| {
            format!(
                "发布本机文件失败 ({}): {}",
                self.target.display(),
                error.error
            )
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_default_without_creating_it_and_never_falls_back() {
        assert!(directory_path(&CaptureDestination::Default, None)
            .unwrap_err()
            .contains("选择保存目录"));
        let root = tempfile::tempdir().unwrap();
        let default =
            directory_path(&CaptureDestination::Default, Some(root.path().into())).unwrap();
        assert_eq!(default, root.path().join("ADB GUI"));
        assert!(!default.exists());
    }

    #[test]
    fn validates_existing_custom_directories_without_recreating_them() {
        let root = tempfile::tempdir().unwrap();
        let path = root.path().join("中文 空格");
        let destination = CaptureDestination::Directory {
            path: path.to_string_lossy().into_owned(),
        };
        assert!(directory_path(&destination, None).is_err());
        fs::create_dir(&path).unwrap();
        assert_eq!(directory_path(&destination, None).unwrap(), path);
        fs::remove_dir(&path).unwrap();
        assert!(capture_target(&destination, "a", "id", "png").is_err());
        assert!(!path.exists());
        assert!(directory_path(
            &CaptureDestination::Directory {
                path: "relative".into()
            },
            None
        )
        .is_err());
        fs::write(&path, b"user").unwrap();
        assert!(directory_path(&destination, None).is_err());
    }

    #[test]
    fn publishes_only_complete_files_and_never_overwrites_automatic_targets() {
        let root = tempfile::tempdir().unwrap();
        let target = root.path().join("shot.png");
        fs::write(&target, b"old").unwrap();
        let mut output = CaptureOutput::new(&target).unwrap();
        output.write(b"new").unwrap();
        assert!(output.verify_size(0).is_err());
        assert!(output.verify_size(9).is_err());
        output.verify_size(3).unwrap();
        assert!(output.publish(false).is_err());
        assert_eq!(fs::read(&target).unwrap(), b"old");
        let mut output = CaptureOutput::new(&target).unwrap();
        output.write(b"confirmed").unwrap();
        output.publish(true).unwrap();
        assert_eq!(fs::read(&target).unwrap(), b"confirmed");
        assert_eq!(fs::read_dir(root.path()).unwrap().count(), 1);
    }

    #[test]
    fn uses_distinct_ids_and_host_safe_names() {
        assert_ne!(capture_id().unwrap(), capture_id().unwrap());
        assert_eq!(safe_serial("usb/device\\name:12?"), "usb_device_name_12_");
    }
}
