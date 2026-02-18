use rusqlite::{Connection, Result, ToSql};
use std::sync::{atomic::Ordering, Arc, Mutex};
use tauri::{AppHandle, Manager, State};

use crate::{
    db_lib::{ensure_tag_schema, is_schema_valid},
    deno::download_deno,
    ffmpeg::download_ffmpeg,
    models::{Asset, AssetMetadata, AssetQueryParams, DbState, PaginatedResponse},
};
mod db_lib;
mod deno;
mod ffmpeg;
mod folder_lib;
mod image_lib;
mod media_lib;
mod models;
mod sound_lib;
mod utils;
mod video_lib;
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
    query_params: Option<AssetQueryParams>,
    query: Option<String>,      // Backward-compat search keyword
    asset_type: Option<String>, // Backward-compat filter: 'all', 'audio', 'video', 'image', 'sfx'
) -> Result<PaginatedResponse, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let safe_page = page.max(1);
    let safe_page_size = page_size.clamp(1, 200);

    let mut params = query_params.unwrap_or_default();
    if params.search.is_none() {
        params.search = query;
    }
    if params.asset_type.is_none() {
        params.asset_type = asset_type;
    }

    let search = params.search.unwrap_or_default();
    let asset_type = params.asset_type.unwrap_or_else(|| "all".to_string());

    let sort_column = match params.sort_by.as_deref() {
        Some("filename") => "filename",
        Some("file_size") => "file_size",
        Some("duration") | Some("duration_sec") => "duration_sec",
        Some("date_created") => "date_created",
        Some("date_modified") => "date_modified",
        _ => "date_modified",
    };
    let sort_order = match params.sort_order.as_deref() {
        Some("asc") | Some("ASC") => "ASC",
        Some("desc") | Some("DESC") => "DESC",
        _ => "DESC",
    };

    let mut sql_base = "FROM assets WHERE 1=1".to_string();
    let mut params_values: Vec<Box<dyn ToSql>> = Vec::new();

    // Tokenized search: split query into words and match all of them
    if !search.trim().is_empty() {
        let tokens: Vec<&str> = search
            .split_whitespace()
            .filter(|s| !s.is_empty())
            .collect();

        if !tokens.is_empty() {
            // Build search condition for each token across filename, original_path, and tags
            let token_conditions = vec![
                "(filename LIKE ? OR original_path LIKE ? OR EXISTS (SELECT 1 FROM asset_tags at JOIN tags t ON t.id = at.tag_id WHERE at.asset_id = assets.id AND t.name LIKE ?))";
                tokens.len()
            ];

            // Combine all token conditions with AND (all tokens must match)
            sql_base.push_str(&format!(" AND ({})", token_conditions.join(" AND ")));

            // Add wildcard parameters for each token (3 params per token: filename, original_path, and tag names)
            for token in tokens {
                let wildcard = format!("%{}%", token);
                params_values.push(Box::new(wildcard.clone()));
                params_values.push(Box::new(wildcard.clone()));
                params_values.push(Box::new(wildcard));
            }
        }
    }

    if asset_type != "all" {
        sql_base.push_str(" AND type = ?");
        params_values.push(Box::new(asset_type));
    }

    if !params.tags.is_empty() {
        for tag in &params.tags {
            let normalized_tag = tag.trim();
            if normalized_tag.is_empty() {
                continue;
            }
            sql_base.push_str(" AND EXISTS (SELECT 1 FROM asset_tags at JOIN tags t ON t.id = at.tag_id WHERE at.asset_id = assets.id AND t.name = ?)");
            params_values.push(Box::new(normalized_tag.to_lowercase()));
        }
    }

    let sql_count = format!("SELECT COUNT(*) {}", sql_base);

    let params_refs: Vec<&dyn ToSql> = params_values.iter().map(|p| p.as_ref()).collect();

    let total_items: u64 = conn
        .query_row(&sql_count, params_refs.as_slice(), |row| {
            row.get::<_, i64>(0).map(|x| x as u64)
        })
        .map_err(|e| format!("Gagal hitung total: {}", e))?;

    let total_pages = (total_items as f64 / safe_page_size as f64).ceil() as u64;

    let offset = (safe_page - 1) * safe_page_size;

    let sql_data = format!(
        "SELECT id, filename, extension, original_path, type, 
                thumbnail_path, duration_sec, file_size, waveform_data, metadata, tags,
                date_created, date_modified
         {} 
         ORDER BY {} {} , id DESC
         LIMIT {} OFFSET {}",
        sql_base, sort_column, sort_order, safe_page_size, offset
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
                tags: row.get("tags")?,
                date_created: row.get("date_created")?,
                date_modified: row.get("date_modified")?,
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
        current_page: safe_page,
    })
}

#[tauri::command]
async fn download_dependencies(
    app: AppHandle,
    window: tauri::Window,
    state: State<'_, DbState>,
) -> Result<String, String> {
    // 1. Try to set busy to true
    if state
        .is_busy
        .swap(true, std::sync::atomic::Ordering::SeqCst)
    {
        return Err("Another process is already running".into());
    }

    // 2. Ensure we reset the flag when done
    let is_busy = state.is_busy.clone();
    let _busy_guard = scopeguard::guard(is_busy, |busy| {
        busy.store(false, std::sync::atomic::Ordering::SeqCst);
    });

    match download_ffmpeg(app.clone(), window.clone()).await {
        Ok(msg) => println!("FFmpeg: {}", msg),
        Err(e) => return Err(format!("Gagal download FFmpeg: {}", e)),
    }

    match download_deno(app.clone(), window.clone()).await {
        Ok(msg) => println!("Deno: {}", msg),
        Err(e) => return Err(format!("Gagal download Deno: {}", e)),
    }

    match yt_dlp::download_ytdlp(app, window).await {
        Ok(msg) => println!("yt-dlp: {}", msg),
        Err(e) => return Err(format!("Gagal download yt-dlp: {}", e)),
    }

    Ok("Semua dependencies berhasil didownload".to_string())
}

#[tauri::command]
fn cancel_scan(state: tauri::State<'_, DbState>) -> Result<String, String> {
    state.cancel_scan.store(true, Ordering::SeqCst);
    println!("Scan cancelled!");
    Ok("Cancel scan success!".to_string())
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
        .map_err(|e| e.to_string())
        .unwrap_or_else(|error| {
            eprintln!("Failed to initialize rayon global thread pool: {}", error);
        });

    let run_result = tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(tauri_plugin_log::log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            // A. Tentukan lokasi database (di folder AppData user)
            let app_data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;
            std::fs::create_dir_all(&app_data_dir)
                .map_err(|e| format!("Failed to create app data dir: {}", e))?;
            let db_path = app_data_dir.join("editon.db");

            {
                let conn = Connection::open(&db_path)
                    .map_err(|e| format!("Failed to open database for schema check: {}", e))?;
                if !is_schema_valid(&conn) {
                    println!("Schema mismatch detected. Recreating database...");
                    drop(conn); // Tutup koneksi agar file bisa dihapus
                    if let Err(e) = std::fs::remove_file(&db_path) {
                        println!("Warning: Failed to delete old DB: {}", e);
                    }
                }
            }

            let mut conn = Connection::open(&db_path)
                .map_err(|e| format!("Failed to open database: {}", e))?;

            conn.pragma_update(None, "journal_mode", "WAL")
                .map_err(|e| format!("Failed to set SQLite journal_mode: {}", e))?;
            conn.pragma_update(None, "synchronous", "NORMAL")
                .map_err(|e| format!("Failed to set SQLite synchronous mode: {}", e))?;

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
                    metadata        TEXT,
                    tags            TEXT,
                    date_created    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    date_modified   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                )",
                [],
            )?;

            conn.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_assets_path_type
                 ON assets(original_path, type)",
                [],
            )?;

            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_assets_type_date_modified
                 ON assets(type, date_modified DESC)",
                [],
            )?;

            ensure_tag_schema(&mut conn)?;

            app.manage(DbState {
                conn: Arc::new(Mutex::new(conn)),
                cancel_scan: Arc::new(std::sync::atomic::AtomicBool::new(false)),
                is_busy: Arc::new(std::sync::atomic::AtomicBool::new(false)),
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
            db_lib::update_asset_tags,
            db_lib::update_assets_tags,
            db_lib::get_available_tags,
            sound_lib::generate_missing_waveforms,
            media_lib::trim_media,
            image_lib::generate_missing_thumbnails,
            video_lib::generate_missing_video_thumbnails,
            folder_lib::scan_and_import_folder,
            folder_lib::trigger_folder_watcher,
            folder_lib::stop_folder_watcher,
            folder_lib::delete_file,
            folder_lib::rename_file,
            cancel_scan,
            download_dependencies,
            get_assets_paginated,
            get_count_assets,
        ])
        .run(tauri::generate_context!());

    if let Err(error) = run_result {
        eprintln!("error while running tauri application: {}", error);
    }
}
