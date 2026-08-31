use std::fs;
use std::path::PathBuf;

const MAX_IMAGE_FILE_BYTES: u64 = 64 * 1024 * 1024;
const SUPPORTED_IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "gif", "bmp", "webp"];

#[tauri::command]
pub fn read_image_file(path: String) -> Result<tauri::ipc::Response, String> {
    let normalized_path = fs::canonicalize(PathBuf::from(&path))
        .map_err(|error| format!("无法访问图片文件 {path}: {error}"))?;

    let extension = normalized_path
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase)
        .ok_or_else(|| "图片文件缺少受支持的扩展名".to_string())?;
    if !SUPPORTED_IMAGE_EXTENSIONS.contains(&extension.as_str()) {
        return Err(format!("不支持的图片格式: .{extension}"));
    }

    let metadata =
        fs::metadata(&normalized_path).map_err(|error| format!("无法读取图片文件信息: {error}"))?;
    if !metadata.is_file() {
        return Err("所选路径不是普通文件".to_string());
    }
    if metadata.len() > MAX_IMAGE_FILE_BYTES {
        return Err(format!(
            "图片文件超过 64 MiB 大小上限: {} 字节",
            metadata.len()
        ));
    }

    let bytes = fs::read(&normalized_path).map_err(|error| format!("读取图片文件失败: {error}"))?;
    Ok(tauri::ipc::Response::new(bytes))
}
