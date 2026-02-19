use std::{
    path::{Path, PathBuf},
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};

use rusqlite::params;
#[cfg(windows)]
use std::os::windows::process::CommandExt;

use tauri::{AppHandle, Manager, State};

use crate::{
    models::DbState,
    sound_lib::get_audio_waveform,
    utils::{get_app_data_dir, get_media_type},
    video_lib::generate_video_thumbnail_buffer,
};

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

fn generate_trimmed_video_thumbnail(app: &AppHandle, video_path: &str) -> Option<String> {
    let app_data_dir = get_app_data_dir(app).ok()?;
    let thumbnails_dir = app_data_dir.join("thumbnails");
    std::fs::create_dir_all(&thumbnails_dir).ok()?;

    let ffmpeg_path = resolve_ffmpeg_path(app);
    let blob = generate_video_thumbnail_buffer(video_path, 200, "0", &ffmpeg_path).ok()?;

    let stem = Path::new(video_path)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("video");
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()?
        .as_millis();
    let thumbnail_name = format!("{}_trim_{}.webp", stem, ts);
    let thumbnail_path = thumbnails_dir.join(thumbnail_name);

    if std::fs::write(&thumbnail_path, &blob).is_err() {
        return None;
    }

    Some(thumbnail_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn trim_media(
    app: AppHandle,
    state: State<'_, DbState>,
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

    let output_string = output.to_string_lossy().to_string();
    let duration_sec = duration;
    let waveform_data = if media_type == "audio" {
        match get_audio_waveform(&output_string, 100) {
            Ok(data) => Some(serde_json::to_string(&data).unwrap_or("[]".to_string())),
            Err(error) => {
                eprintln!(
                    "Failed to generate waveform for trimmed audio {}: {}",
                    output_string, error
                );
                None
            }
        }
    } else {
        None
    };
    let thumbnail_path = if media_type == "video" {
        match generate_trimmed_video_thumbnail(&app, &output_string) {
            Some(path) => Some(path),
            None => {
                eprintln!(
                    "Failed to generate thumbnail for trimmed video {}",
                    output_string
                );
                None
            }
        }
    } else {
        None
    };

    upsert_trimmed_asset(
        &state,
        &output_string,
        &media_type,
        duration_sec,
        waveform_data,
        thumbnail_path,
    )?;

    Ok(output_string)
}

fn upsert_trimmed_asset(
    state: &State<'_, DbState>,
    output_path: &str,
    media_type: &str,
    duration_sec: f64,
    waveform_data: Option<String>,
    thumbnail_path: Option<String>,
) -> Result<(), String> {
    let output = Path::new(output_path);
    let metadata = std::fs::metadata(output).map_err(|e| e.to_string())?;
    let file_size = i64::try_from(metadata.len()).map_err(|e| e.to_string())?;

    let filename = output
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or("Invalid output filename")?
        .to_string();

    let extension = output
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_string();

    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO assets (filename, extension, original_path, type, file_size, metadata, duration_sec, thumbnail_path, waveform_data, tags)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
         ON CONFLICT(original_path) DO UPDATE SET
           filename = excluded.filename,
           extension = excluded.extension,
           type = excluded.type,
           file_size = excluded.file_size,
           duration_sec = excluded.duration_sec,
           thumbnail_path = COALESCE(excluded.thumbnail_path, assets.thumbnail_path),
           waveform_data = COALESCE(excluded.waveform_data, assets.waveform_data),
           date_modified = CURRENT_TIMESTAMP",
        params![
            filename,
            extension,
            output_path,
            media_type,
            file_size,
            "{}",
            duration_sec,
            thumbnail_path,
            waveform_data,
            Option::<String>::None,
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}
