
use std::{fs, path::PathBuf};

use tauri::{AppHandle, Manager};

pub fn get_app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    let bin_dir = app_data.join("bin");

    if !bin_dir.exists() {
        fs::create_dir_all(&bin_dir)
            .map_err(|e| format!("Failed to create bin directory: {}", e))?;
    }

    Ok(bin_dir)
}

pub fn get_media_type(ext: &str) -> Option<String> {
    match ext.to_lowercase().as_str() {
        // Image
        "jpg" | "jpeg" | "png" | "webp" | "gif" | "bmp" | "svg" | "ico" => {
            Some("image".to_string())
        }

        // Video
        "mp4" | "mkv" | "mov" | "avi" | "webm" | "flv" | "wmv" => Some("video".to_string()),

        // Audio (Semua jenis suara jadi satu)
        "mp3" | "wav" | "ogg" | "flac" | "aac" | "m4a" | "wma" | "aiff" => {
            Some("audio".to_string())
        }

        _ => None, // File lain diabaikan
    }
}
