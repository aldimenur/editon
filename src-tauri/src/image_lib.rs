use std::fs::File;
use std::io::BufReader;
use std::io::Cursor;
use std::num::NonZeroU32;
use std::sync::atomic::{AtomicUsize, Ordering};
use fast_image_resize::{images::Image, PixelType, ResizeAlg, ResizeOptions, Resizer};
use image::codecs::webp::WebPEncoder;
use image::ExtendedColorType;
use image::ImageEncoder;
use image::ImageReader;
use rayon::prelude::*;
use tauri::Manager;
use tauri::{ Emitter};

use crate::AssetMetadata;
use crate::DbState;
use crate::models::ApiResponse;
use crate::models::ProgressEvent;


#[tauri::command]
pub fn cancel_scan(state: tauri::State<'_, DbState>) -> Result<String, String> {
    state.cancel_scan.store(true, Ordering::SeqCst);

    Ok("Cancel scan success!".to_string())
}

pub fn get_image_metadata(path: &str, ext: &str) -> AssetMetadata {
    if ext == "svg" {
        return AssetMetadata::None;
    }

    match image::image_dimensions(path) {
        Ok((w, h)) => AssetMetadata::Image {
            width: w,
            height: h,
            format: ext.to_string(),
        },
        Err(_) => AssetMetadata::None,
    }
}

pub fn generate_thumbnail_buffer(path: &str, target_width: u32) -> Result<Vec<u8>, String> {
    // 1. Buka File (Gunakan BufReader untuk sedikit optimasi I/O)
    let file = File::open(path).map_err(|e| e.to_string())?;
    let reader = BufReader::new(file);

    // 2. Decode ke RGBA8
    let img = ImageReader::new(reader)
        .with_guessed_format()
        .map_err(|e| e.to_string())?
        .decode()
        .map_err(|e| e.to_string())?
        .to_rgba8();

    let width = NonZeroU32::new(img.width()).ok_or("Width 0")?;
    let height = NonZeroU32::new(img.height()).ok_or("Height 0")?;

    // 3. Setup Fast Image Resize
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

    // 4. Resize (Nearest Neighbor untuk kecepatan maksimal)
    let mut resizer = Resizer::new();
    resizer
        .resize(
            &src_view,
            &mut dst_image,
            &ResizeOptions::new().resize_alg(ResizeAlg::Nearest),
        )
        .map_err(|e| e.to_string())?;

    // 5. Encode ke WebP (Raw Bytes)
    let mut buffer = Cursor::new(Vec::new());
    let encoder = WebPEncoder::new_lossless(&mut buffer); // Lossy

    encoder
        .write_image(
            dst_image.buffer(),
            target_width,
            target_height,
            ExtendedColorType::Rgba8,
        )
        .map_err(|e| e.to_string())?;

    // Return Vec<u8> (BLOB siap simpan ke SQLite)
    Ok(buffer.into_inner())
}

#[tauri::command]
pub fn generate_missing_thumbnails(
    app: tauri::AppHandle,
    state: tauri::State<'_, DbState>,
) -> Result<ApiResponse, String> {
    let db_arc = state.conn.clone();

    state.cancel_scan.store(false, Ordering::SeqCst);
    let cancel_flag = state.cancel_scan.clone();

    // 1. Tentukan lokasi folder thumbnail di AppData
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let thumbnails_dir = app_data_dir.join("thumbnails");

    // Pastikan folder thumbnails sudah ada
    if !thumbnails_dir.exists() {
        std::fs::create_dir_all(&thumbnails_dir).map_err(|e| e.to_string())?;
    }
    // 2. Ambil daftar file (khusus image) yang thumbnail_path-nya masih kosong/NULL
    let to_process: Vec<(i64, String, String, String)> = {
        let conn = db_arc.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT id, original_path, filename, extension FROM assets 
             WHERE (thumbnail_path IS NULL)
             AND type = 'image'", // Untuk saat ini kita fokus ke image
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, i64>(0)?,    // id
                    row.get::<_, String>(1)?, // path
                    row.get::<_, String>(2)?, // filename
                    row.get::<_, String>(3)?, // extension
                ))
            })
            .map_err(|e| e.to_string())?;

        rows.filter_map(|r| r.ok()).collect()
    };

    let total_files = to_process.len();
    if total_files == 0 {
        return Ok(ApiResponse { message: format!("Semua thumbnail sudah di generate!"), status: format!("Success") });
    }
    // 2. Buat counter atomic
    let processed_count = std::sync::Arc::new(AtomicUsize::new(0));
    // 3. Jalankan proses di background thread
    std::thread::spawn(move || {
        to_process
            .par_iter()
            .for_each(|(id, path, filename, extension)| {
                // Check cancel flag FIRST before processing
                if cancel_flag.load(Ordering::SeqCst) {
                    return;
                };

                let metadata = get_image_metadata(path, extension);
                let metadata_json = serde_json::to_string(&metadata).unwrap_or("{}".to_string());
                let current = processed_count.fetch_add(1, Ordering::SeqCst) + 1;

                let _ = app.emit(
                    "thumbnail-progress",
                    ProgressEvent {
                        name: "Image".to_string(),
                        current,
                        total: total_files,
                        filename: filename.clone(),
                        status: "processing".to_string(),
                    },
                );

                if extension.to_lowercase() == "svg" {
                    if let Ok(conn) = db_arc.lock() {
                        let _ = conn.execute(
                            "UPDATE assets SET thumbnail_path = ?1 WHERE id = ?2",
                            rusqlite::params![path, id],
                        );
                    };
                    return;
                }

                match generate_thumbnail_buffer(path, 200) {
                    Ok(blob) => {
                        // Simpan blob ke file system
                        let thumb_filename = format!("{}.webp", id);
                        let thumb_path = thumbnails_dir.join(&thumb_filename);
                        let thumb_path_str = thumb_path.to_string_lossy().to_string();

                        if let Ok(_) = std::fs::write(&thumb_path, &blob) {
                            // Update database: simpan path-nya dan hapus blob untuk menghemat space DB
                            if let Ok(conn) = db_arc.lock() {
                                let _ = conn.execute(
                                    "UPDATE assets SET thumbnail_path = ?1, metadata = ?2 WHERE id = ?3",
                                    rusqlite::params![thumb_path_str, metadata_json, id],
                                );
                            }
                        }
                    }
                    Err(e) => {
                        println!("Gagal generate thumbnail untuk {}: {}", filename, e);
                    }
                }
            });
        // D. Emit selesai
        let _ = app.emit(
            "thumbnail-progress",
            ProgressEvent {
                name: "Image".to_string(),
                current: total_files,
                total: total_files,
                filename: "Selesai!".to_string(),
                status: "done".to_string(),
            },
        );
    });

    Ok(ApiResponse { message: format!("Memulai prosess generate thumbnail untuk {} gambar", total_files), status: "Processing".to_string() })
}
