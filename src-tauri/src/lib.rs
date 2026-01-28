use rusqlite::{Connection, Result, ToSql};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager, State};

use crate::{
    db_lib::is_schema_valid,
    ffmpeg::download_ffmpeg,
    models::{Asset, AssetMetadata, DbState, PaginatedResponse},
};
mod db_lib;
mod ffmpeg;
mod folder_lib;
mod image_lib;
mod models;
mod sound_lib;
mod utils;
mod yt_dlp;

#[tauri::command]
fn get_count_assets(state: State<'_, DbState>, asset_type: String) -> Result<u64, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let count: i64 = if asset_type == "all" {
        conn.query_row("SELECT COUNT(*) FROM assets", [], |row| row.get(0))
            .map_err(|e| e.to_string())?
    } else {
        conn.query_row(
            "SELECT COUNT(*) FROM assets WHERE type = ?1",
            [asset_type],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?
    };

    Ok(count as u64)
}

#[tauri::command]
fn get_assets_paginated(
    state: State<'_, DbState>,
    page: u32,
    page_size: u32,
    query: String,      // Search keyword (kosong string jika tidak search)
    asset_type: String, // Filter: 'all', 'audio', 'video', 'image', 'sfx'
) -> Result<PaginatedResponse, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let mut sql_base = "FROM assets WHERE 1=1".to_string();
    let mut params_values: Vec<Box<dyn ToSql>> = Vec::new(); // Penampung parameter

    // Tokenized search: split query into words and match all of them
    if !query.trim().is_empty() {
        let tokens: Vec<&str> = query.split_whitespace().filter(|s| !s.is_empty()).collect();

        if !tokens.is_empty() {
            // Build search condition for each token across filename and original_path
            let mut token_conditions = Vec::new();
            for _ in &tokens {
                token_conditions.push("(filename LIKE ? OR original_path LIKE ?)");
            }

            // Combine all token conditions with AND (all tokens must match)
            sql_base.push_str(&format!(" AND ({})", token_conditions.join(" AND ")));

            // Add wildcard parameters for each token (2 params per token: filename and original_path)
            for token in tokens {
                let wildcard = format!("%{}%", token);
                params_values.push(Box::new(wildcard.clone()));
                params_values.push(Box::new(wildcard));
            }
        }
    }

    if asset_type != "all" {
        sql_base.push_str(" AND type = ?");
        params_values.push(Box::new(asset_type));
    }

    let sql_count = format!("SELECT COUNT(*) {}", sql_base);

    let params_refs: Vec<&dyn ToSql> = params_values.iter().map(|p| p.as_ref()).collect();

    let total_items: u64 = conn
        .query_row(&sql_count, params_refs.as_slice(), |row| {
            row.get::<_, i64>(0).map(|x| x as u64)
        })
        .map_err(|e| format!("Gagal hitung total: {}", e))?;

    let total_pages = (total_items as f64 / page_size as f64).ceil() as u64;

    let offset = (page.max(1) - 1) * page_size;

    let sql_data = format!(
        "SELECT id, filename, extension, original_path, type, 
                thumbnail_path, duration_sec, file_size, waveform_data, metadata
         {} 
         ORDER BY id ASC 
         LIMIT {} OFFSET {}",
        sql_base, page_size, offset
    );

    let mut stmt = conn.prepare(&sql_data).map_err(|e| e.to_string())?;

    let asset_iter = stmt
        .query_map(params_refs.as_slice(), |row| {
            let waveform_str: String = row.get("waveform_data").unwrap_or("[]".to_string());
            let metadata_str: String = row.get("metadata").unwrap_or("{}".to_string());

            Ok(Asset {
                id: row.get("id")?,
                filename: row.get("filename")?,
                extension: row.get("extension")?,
                original_path: row.get("original_path")?,
                type_name: row.get("type")?,
                thumbnail_path: row.get("thumbnail_path")?,
                duration_sec: row.get("duration_sec")?,
                file_size: row.get("file_size")?,
                waveform_data: serde_json::from_str(&waveform_str).unwrap_or_default(),
                metadata: serde_json::from_str(&metadata_str).unwrap_or(AssetMetadata::None),
            })
        })
        .map_err(|e| e.to_string())?;

    let mut data = Vec::new();
    for asset in asset_iter {
        data.push(asset.map_err(|e| e.to_string())?);
    }

    Ok(PaginatedResponse {
        data,
        total_items,
        total_pages,
        current_page: page,
    })
}

#[tauri::command]
async fn download_dependencies(app: AppHandle, window: tauri::Window) -> Result<String, String> {
    match download_ffmpeg(app.clone(), window.clone()).await {
        Ok(msg) => println!("FFmpeg: {}", msg),
        Err(e) => return Err(format!("Gagal download FFmpeg: {}", e)),
    }

    match yt_dlp::download_ytdlp(app, window).await {
        Ok(msg) => println!("yt-dlp: {}", msg),
        Err(e) => return Err(format!("Gagal download yt-dlp: {}", e)),
    }

    Ok("Semua dependencies berhasil didownload".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let total_cores = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(1);
    let rayon_thread = (total_cores / 2).max(1);

    println!(
        "Cpu memiliki {} threads. Rayon menggunakan {} threads",
        total_cores, rayon_thread
    );

    rayon::ThreadPoolBuilder::new()
        .num_threads(rayon_thread)
        .build_global()
        .unwrap();
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            // A. Tentukan lokasi database (di folder AppData user)
            let app_data_dir = app.path().app_data_dir().unwrap();
            std::fs::create_dir_all(&app_data_dir).unwrap();
            let db_path = app_data_dir.join("editon.db");

            {
                let conn = Connection::open(&db_path).unwrap();
                if !is_schema_valid(&conn) {
                    println!("Schema mismatch detected. Recreating database...");
                    drop(conn); // Tutup koneksi agar file bisa dihapus
                    if let Err(e) = std::fs::remove_file(&db_path) {
                        println!("Warning: Failed to delete old DB: {}", e);
                    }
                }
            }

            let conn = Connection::open(&db_path).unwrap();

            conn.pragma_update(None, "journal_mode", "WAL").unwrap();
            conn.pragma_update(None, "synchronous", "NORMAL").unwrap();

            conn.execute(
                "CREATE TABLE IF NOT EXISTS assets (
                    id              INTEGER PRIMARY KEY AUTOINCREMENT,
                    filename        TEXT NOT NULL,
                    extension       TEXT NOT NULL,
                    original_path   TEXT NOT NULL UNIQUE,
                    type            TEXT NOT NULL,
                    thumbnail_path  TEXT,
                    duration_sec    REAL DEFAULT 0,
                    file_size       INTEGER NOT NULL,
                    waveform_data   TEXT,
                    metadata        TEXT
                )",
                [],
            )?;

            conn.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_assets_path_type
                 ON assets(original_path, type)",
                [],
            )?;

            app.manage(DbState {
                conn: Arc::new(Mutex::new(conn)),
                cancel_scan: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            });

            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_drag::init())
        .invoke_handler(tauri::generate_handler![
            yt_dlp::check_dependencies,
            yt_dlp::get_ytdlp_version,
            yt_dlp::update_ytdlp,
            yt_dlp::run_ytdlp,
            db_lib::clear_db,
            sound_lib::generate_missing_waveforms,
            image_lib::generate_missing_thumbnails,
            image_lib::cancel_scan,
            folder_lib::scan_and_import_folder,
            folder_lib::trigger_folder_watcher,
            download_dependencies,
            get_assets_paginated,
            get_count_assets,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
