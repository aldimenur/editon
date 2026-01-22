use rusqlite::{Connection, Result, ToSql};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::{Manager, State};
use walkdir::WalkDir;

use crate::db_lib::is_schema_valid;
mod db_lib;
mod sound_lib;
mod image_lib;
// Enum Metadata
#[derive(Debug, Serialize, Deserialize)]
#[serde(untagged)] // Biar otomatis deteksi varian berdasarkan isi field-nya
pub enum AssetMetadata {
    Audio {
        sample_rate: u32,
        bitrate: u32,
        artist: Option<String>,
    },
    Video {
        width: u32,
        height: u32,
        fps: f32,
    },
    Image {
        width: u32,
        height: u32,
        format: String,
    },
    None,
}

#[derive(Clone, Serialize)]
struct ProgressEvent {
    current: usize,
    total: usize,
    filename: String,
    status: String, // "processing" atau "done"
}

// Struct Utama
#[derive(Debug, Serialize, Deserialize)]
pub struct Asset {
    pub id: Option<i64>, // Option karena saat insert ID belum ada (auto increment)
    pub filename: String,
    pub extension: String,
    pub original_path: String,
    pub type_name: String, // 'audio', 'video', 'image'

    pub thumbnail_path: Option<String>,
    pub duration_sec: f64,
    pub file_size: i64,

    // Waveform disimpan sebagai bytes binary
    pub waveform_data: Option<Vec<f32>>,

    // Metadata fleksibel
    pub metadata: AssetMetadata,
}

#[derive(Debug, Serialize)]
pub struct PaginatedResponse {
    pub data: Vec<Asset>,
    pub total_items: u64,
    pub total_pages: u64,
    pub current_page: u32,
}

pub struct DbState {
    pub conn: Arc<Mutex<Connection>>,
}

fn get_media_type(ext: &str) -> Option<String> {
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

#[tauri::command]
fn show_in_folder(path: String) {
    use std::process::Command;

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .args(["/select,", &path])
            .spawn()
            .unwrap();
    }
    #[cfg(not(target_os = "windows"))]
    {
        // Fallback untuk OS lain (buka foldernya saja)
        if let Some(parent) = std::path::Path::new(&path).parent() {
            let _ = open::that(parent); // Bisa pakai crate 'open' biar simpel
        }
    }
}

#[tauri::command]
fn scan_and_import_folder(
    state: State<'_, DbState>,
    folder_path: String,
) -> Result<String, String> {
    // Lock database
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;

    // A. Mulai Transaksi (Wajib biar cepat)
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let mut count = 0;

    {
        // B. Siapkan Query
        // Gunakan INSERT OR IGNORE: Jika file dengan path yang sama sudah ada, skip (tidak error).
        let mut stmt = tx
            .prepare_cached(
                "INSERT OR IGNORE INTO assets 
            (filename, extension, original_path, type, file_size, metadata, duration_sec) 
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            )
            .map_err(|e| e.to_string())?;

        // C. Loop Folder (Recursive)
        for entry in WalkDir::new(&folder_path)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            let path = entry.path();

            if path.is_file() {
                // Ambil ekstensi
                if let Some(ext_os) = path.extension() {
                    let ext_str = ext_os.to_string_lossy().to_string();

                    // Cek tipe (Image/Video/Audio)
                    if let Some(media_type) = get_media_type(&ext_str) {
                        // Siapkan data dasar
                        let filename = path.file_name().unwrap().to_string_lossy().to_string();
                        let path_str = path.to_string_lossy().to_string();
                        let file_size = entry.metadata().map(|m| m.len()).unwrap_or(0);

                        // Eksekusi Insert
                        // Data berat (waveform, duration) diisi default dulu (0 atau kosong)
                        stmt.execute(rusqlite::params![
                            filename,         // ?1
                            ext_str,          // ?2
                            path_str,         // ?3
                            media_type,       // ?4 ('audio', 'video', 'image')
                            file_size as i64, // ?5
                            "{}",             // ?6 Metadata JSON (kosong)
                            0.0,              // ?7 Duration (0 detik)
                        ])
                        .map_err(|e| e.to_string())?;

                        count += 1;
                    }
                }
            }
        }
    } // Statement didrop di sini

    // D. Commit Transaksi (Simpan permanen)
    tx.commit().map_err(|e| e.to_string())?;

    Ok(format!("Berhasil scan: {} file baru ditambahkan.", count))
}

#[tauri::command]
fn get_count_assets(state: State<'_, DbState>, asset_type: String) -> Result<u64, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    // 2. Gunakan query_row untuk mengambil hasil SELECT COUNT
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

    // 3. Kembalikan hasilnya
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

    // 1. Bangun Query Builder Dinamis (WHERE Clause)
    let mut sql_base = "FROM assets WHERE 1=1".to_string();
    let mut params_values: Vec<Box<dyn ToSql>> = Vec::new(); // Penampung parameter

    // Filter A: Search Query (Filename)
    if !query.trim().is_empty() {
        sql_base.push_str(" AND filename LIKE ?");
        let wildcard = format!("%{}%", query);
        params_values.push(Box::new(wildcard));
    }

    // Filter B: Asset Type (Enum)
    if asset_type != "all" {
        sql_base.push_str(" AND type = ?");
        params_values.push(Box::new(asset_type));
    }

    // ---------------------------------------------------------
    // 2. Hitung Total Data (Untuk Pagination Info)
    // ---------------------------------------------------------
    let sql_count = format!("SELECT COUNT(*) {}", sql_base);

    // Rusqlite butuh slice of references &[&dyn ToSql], kita convert dari Vec<Box>
    let params_refs: Vec<&dyn ToSql> = params_values.iter().map(|p| p.as_ref()).collect();

    let total_items: u64 = conn
        .query_row(&sql_count, params_refs.as_slice(), |row| {
            row.get::<_, i64>(0).map(|x| x as u64)
        })
        .map_err(|e| format!("Gagal hitung total: {}", e))?;

    let total_pages = (total_items as f64 / page_size as f64).ceil() as u64;

    // ---------------------------------------------------------
    // 3. Ambil Data (LIMIT & OFFSET)
    // ---------------------------------------------------------
    // Offset: (Halaman 1 -> 0), (Halaman 2 -> 20), dst.
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

    // Query map
    let asset_iter = stmt
        .query_map(params_refs.as_slice(), |row| {
            // Parsing JSON manual dari String DB ke Struct Rust
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

    // Collect hasil
    let mut data = Vec::new();
    for asset in asset_iter {
        data.push(asset.map_err(|e| e.to_string())?);
    }

    // 4. Return Hasil Lengkap
    Ok(PaginatedResponse {
        data,
        total_items,
        total_pages,
        current_page: page,
    })
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

            // B. Buka Koneksi baru
            let conn = Connection::open(&db_path).unwrap();

            // D. Aktifkan WAL Mode (Write-Ahead Logging) dan performa setting
            conn.pragma_update(None, "journal_mode", "WAL").unwrap();
            conn.pragma_update(None, "synchronous", "NORMAL").unwrap();
            // E. Buat tabel baru jika belum ada
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

            // F. Buat index baru (gunakan IF NOT EXISTS supaya tidak error)
            conn.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_assets_path_type
                 ON assets(original_path, type)",
                [],
            )?;

            // G. Simpan koneksi ke State Tauri
            app.manage(DbState {
                conn: Arc::new(Mutex::new(conn)),
            });

            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_drag::init())
        .invoke_handler(tauri::generate_handler![
            db_lib::clear_db,
            scan_and_import_folder,
            sound_lib::generate_missing_waveforms,
            get_assets_paginated,
            image_lib::generate_missing_thumbnails,
            get_count_assets,
            show_in_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
