use fast_image_resize::{images::Image, PixelType, ResizeAlg, ResizeOptions, Resizer};
use image::codecs::webp::WebPEncoder;
use image::{ExtendedColorType, ImageEncoder, ImageReader};
use rayon::prelude::*;
use std::io::{BufReader, Cursor};
use std::num::NonZeroU32;
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::process::Command;
use std::sync::atomic::{AtomicUsize, Ordering};
use tauri::{Emitter, Manager};

use crate::models::ApiResponse;
use crate::models::ProgressEvent;
use crate::DbState;

use crate::utils::get_app_data_dir;

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

pub fn generate_video_thumbnail_buffer(
    path: &str,
    target_width: u32,
    seek_time: &str,
    ffmpeg_path: &str,
) -> Result<Vec<u8>, String> {
    // Run ffmpeg to output a single PNG frame to stdout
    let mut cmd = Command::new(ffmpeg_path);
    cmd.args(&[
        "-ss",
        seek_time,
        "-i",
        path,
        "-frames:v",
        "1",
        "-f",
        "image2pipe",
        "-vcodec",
        "png",
        "-",
    ]);

    #[cfg(windows)]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW flag to hide console

    let output = cmd.output().map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(format!(
            "ffmpeg failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    // Decode PNG from stdout
    let reader = Cursor::new(output.stdout);
    let img = ImageReader::new(BufReader::new(reader))
        .with_guessed_format()
        .map_err(|e| e.to_string())?
        .decode()
        .map_err(|e| e.to_string())?
        .to_rgba8();

    let width = NonZeroU32::new(img.width()).ok_or("Width 0")?;
    let height = NonZeroU32::new(img.height()).ok_or("Height 0")?;

    let src_view = fast_image_resize::images::ImageRef::new(
        width.get(),
        height.get(),
        img.as_raw(),
        PixelType::U8x4,
    )
    .map_err(|e| e.to_string())?;

    let aspect_ratio = width.get() as f32 / height.get() as f32;
    let target_height = (target_width as f32 / aspect_ratio) as u32;
    let dst_width = NonZeroU32::new(target_width).ok_or("Target width 0")?;
    let dst_height = NonZeroU32::new(target_height).ok_or("Target height 0")?;

    let mut dst_image = Image::new(dst_width.get(), dst_height.get(), PixelType::U8x4);

    let mut resizer = Resizer::new();
    resizer
        .resize(
            &src_view,
            &mut dst_image,
            &ResizeOptions::new().resize_alg(ResizeAlg::Nearest),
        )
        .map_err(|e| e.to_string())?;

    // Encode to WebP
    let mut buffer = Cursor::new(Vec::new());
    let encoder = WebPEncoder::new_lossless(&mut buffer);
    encoder
        .write_image(
            dst_image.buffer(),
            target_width,
            target_height,
            ExtendedColorType::Rgba8,
        )
        .map_err(|e| e.to_string())?;

    Ok(buffer.into_inner())
}

#[tauri::command]
pub fn generate_missing_video_thumbnails(
    app: tauri::AppHandle,
    state: tauri::State<'_, DbState>,
) -> Result<ApiResponse, String> {
    let db_arc = state.conn.clone();

    state.cancel_scan.store(false, Ordering::SeqCst);
    let cancel_flag = state.cancel_scan.clone();

    // thumbnails folder
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let thumbnails_dir = app_data_dir.join("thumbnails");
    if !thumbnails_dir.exists() {
        std::fs::create_dir_all(&thumbnails_dir).map_err(|e| e.to_string())?;
    }

    // Collect videos missing thumbnails
    let to_process: Vec<(i64, String, String, String)> = {
        let conn = db_arc.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT id, original_path, filename, extension FROM assets 
             WHERE (thumbnail_path IS NULL)
             AND type = 'video'",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        rows.filter_map(|r| r.ok()).collect()
    };

    let total_files = to_process.len();
    if total_files == 0 {
        return Ok(ApiResponse {
            message: format!("All video thumbnails already generated"),
            status: "Success".to_string(),
        });
    }

    let processed_count = std::sync::Arc::new(AtomicUsize::new(0));

    // Resolve ffmpeg path once
    let ffmpeg_path = resolve_ffmpeg_path(&app);

    std::thread::spawn(move || {
        to_process.par_iter().for_each(|(id, path, filename, _)| {
            if cancel_flag.load(Ordering::SeqCst) {
                return;
            }

            let current = processed_count.fetch_add(1, Ordering::SeqCst) + 1;

            let _ = app.emit(
                "thumbnail-progress",
                ProgressEvent {
                    name: "Video".to_string(),
                    current,
                    total: total_files,
                    filename: filename.clone(),
                    status: "processing".to_string(),
                },
            );

            match generate_video_thumbnail_buffer(path, 200, "1", &ffmpeg_path) {
                Ok(blob) => {
                    let thumb_filename = format!("{}.webp", id);
                    let thumb_path = thumbnails_dir.join(&thumb_filename);
                    let thumb_path_str = thumb_path.to_string_lossy().to_string();

                    if let Ok(_) = std::fs::write(&thumb_path, &blob) {
                        if let Ok(conn) = db_arc.lock() {
                            let _ = conn.execute(
                                "UPDATE assets SET thumbnail_path = ?1, date_modified = CURRENT_TIMESTAMP WHERE id = ?2",
                                rusqlite::params![thumb_path_str, id],
                            );
                        }
                    }
                }
                Err(e) => {
                    println!("Failed to generate thumbnail for {}: {}", filename, e);
                    // Mark as failed to avoid infinite reprocessing loops.
                    if let Ok(conn) = db_arc.lock() {
                        let _ = conn.execute(
                            "UPDATE assets SET thumbnail_path = '', date_modified = CURRENT_TIMESTAMP WHERE id = ?1",
                            rusqlite::params![id],
                        );
                    }
                }
            }
        });

        let _ = app.emit(
            "thumbnail-progress",
            ProgressEvent {
                name: "Video".to_string(),
                current: total_files,
                total: total_files,
                filename: "Done".to_string(),
                status: "done".to_string(),
            },
        );
    });

    Ok(ApiResponse {
        message: format!("Started generating thumbnails for {} videos", total_files),
        status: "Processing".to_string(),
    })
}
