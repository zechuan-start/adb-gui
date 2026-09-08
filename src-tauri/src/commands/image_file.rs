use crate::{error::AppError, error_codes as codes};
use std::fs;
use std::path::PathBuf;

const MAX_IMAGE_FILE_BYTES: u64 = 64 * 1024 * 1024;
const SUPPORTED_IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "gif", "bmp", "webp"];

#[tauri::command]
pub fn read_image_file(path: String) -> Result<tauri::ipc::Response, AppError> {
    let normalized_path = fs::canonicalize(PathBuf::from(&path)).map_err(|error| {
        AppError::new(codes::IMAGE_ACCESS_FAILED)
            .param("path", path.clone())
            .detail(error.to_string())
    })?;

    let extension = normalized_path
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase)
        .ok_or_else(|| AppError::new(codes::IMAGE_MISSING_EXTENSION))?;
    if !SUPPORTED_IMAGE_EXTENSIONS.contains(&extension.as_str()) {
        return Err(AppError::new(codes::IMAGE_UNSUPPORTED_EXTENSION).param("extension", extension));
    }

    let metadata = fs::metadata(&normalized_path)
        .map_err(|error| AppError::new(codes::IMAGE_METADATA_FAILED).detail(error.to_string()))?;
    if !metadata.is_file() {
        return Err(AppError::new(codes::IMAGE_NOT_REGULAR_FILE));
    }
    if metadata.len() > MAX_IMAGE_FILE_BYTES {
        return Err(AppError::new(codes::IMAGE_TOO_LARGE).param("bytes", metadata.len()));
    }

    let bytes = fs::read(&normalized_path)
        .map_err(|error| AppError::new(codes::IMAGE_READ_FAILED).detail(error.to_string()))?;
    Ok(tauri::ipc::Response::new(bytes))
}
