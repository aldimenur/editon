use std::{
    path::{Path, PathBuf},
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

use tauri::{AppHandle, Manager};

use crate::utils::{get_app_data_dir, get_media_type};

/// Try to locate ffmpeg binary: first under app data bin, else fallback to `ffmpeg` on PATH.
fn resolve_ffmpeg_path(app: &tauri::AppHandle) -> String {
    if let Ok(bin_dir) = get_app_data_dir(app) {
        let exe = bin_dir.join("ffmpeg.exe");
        if exe.exists() {
            return exe.to_string_lossy().to_string();
        }
    }
    "ffmpeg".to_string()
}

fn resolve_output_path(
    app: &AppHandle,
    input: &Path,
    output_path: Option<String>,
    media_type: &str,
) -> Result<PathBuf, String> {
    if let Some(path) = output_path {
        return Ok(PathBuf::from(path));
    }

    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let trimmed_dir = app_data_dir.join("trimmed").join(media_type);
    std::fs::create_dir_all(&trimmed_dir).map_err(|e| e.to_string())?;

    let stem = input
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("media");
    let ext = input.extension().and_then(|s| s.to_str()).unwrap_or("bin");
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis();

    Ok(trimmed_dir.join(format!("{}_trim_{}.{}", stem, ts, ext)))
}

#[tauri::command]
pub fn trim_media(
    app: AppHandle,
    input_path: String,
    start_sec: f64,
    end_sec: f64,
    output_path: Option<String>,
) -> Result<String, String> {
    if start_sec < 0.0 {
        return Err("Start time must be >= 0".to_string());
    }
    if end_sec <= start_sec {
        return Err("End time must be greater than start time".to_string());
    }

    let input = Path::new(&input_path);
    if !input.exists() {
        return Err("Input file not found".to_string());
    }

    let media_type = input
        .extension()
        .and_then(|s| s.to_str())
        .and_then(get_media_type)
        .ok_or("Unsupported media type. Only audio or video files are allowed.")?;

    if media_type != "audio" && media_type != "video" {
        return Err("Unsupported media type. Only audio or video files are allowed.".to_string());
    }

    let output = resolve_output_path(&app, input, output_path, &media_type)?;

    if output == input {
        return Err("Output path must be different from input".to_string());
    }

    if let Some(parent) = output.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let duration = end_sec - start_sec;
    let ffmpeg_path = resolve_ffmpeg_path(&app);
    let mut cmd = Command::new(ffmpeg_path);
    cmd.args([
        "-y",
        "-i",
        &input_path,
        "-ss",
        &format!("{:.3}", start_sec),
        "-t",
        &format!("{:.3}", duration),
        "-map",
        "0",
        "-c",
        "copy",
        output.to_string_lossy().as_ref(),
    ]);

    #[cfg(windows)]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW flag

    let output_result = cmd.output().map_err(|e| e.to_string())?;
    if !output_result.status.success() {
        return Err(format!(
            "ffmpeg failed: {}",
            String::from_utf8_lossy(&output_result.stderr)
        ));
    }

    Ok(output.to_string_lossy().to_string())
}
