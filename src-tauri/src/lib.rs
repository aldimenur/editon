use walkdir::WalkDir;
use std::sync::Mutex;
use serde::{Serialize, Deserialize};
use tauri::{State, Manager};
use rusqlite::{Connection, Result};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Asset {
    id: i32,
    name: String,
    path: String,
    size: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PaginatedAssets {
    assets: Vec<Asset>,
    total: usize,
    page: usize,
    page_size: usize,
    total_pages: usize,
}

// --- HELPER FUNCTIONS (Private) ---
// Fungsi ini tidak bisa dipanggil Frontend, cuma pembantu biar codingan rapi
fn scan_folder_by_extensions(folder_path: &str, valid_extensions: &[&str]) -> Vec<Asset> {
    let mut assets = Vec::new();

    // Scan folder secara rekursif menggunakan WalkDir
    for entry in WalkDir::new(folder_path).into_iter().flatten() {
        let path = entry.path();

        if path.is_file() {
            if let Some(ext) = path.extension() {
                let ext_str = ext.to_str().unwrap_or("").to_lowercase();

                // Cek apakah ekstensi ada di daftar yang diinginkan
                if valid_extensions.contains(&ext_str.as_str()) {
                    // Gunakan metadata dari WalkDir entry untuk efisiensi
                    if let Ok(metadata) = entry.metadata() {
                        assets.push(Asset {
                            id: 0,
                            name: path
                                .file_name()
                                .unwrap_or_default()
                                .to_string_lossy()
                                .to_string(),
                            path: path.to_string_lossy().to_string(),
                            size: metadata.len() as i64,
                        });
                    }
                }
            }
        }
    }
    assets
}

// Fungsi helper untuk filter berdasarkan search query
fn filter_assets_by_query(assets: Vec<Asset>, query: Option<String>) -> Vec<Asset> {
    match query {
        Some(q) if !q.trim().is_empty() => {
            let query_lower = q.to_lowercase();
            assets.into_iter()
                .filter(|asset| asset.name.to_lowercase().contains(&query_lower))
                .collect()
        },
        _ => assets,
    }
}

// Fungsi helper untuk pagination
fn paginate_assets(assets: Vec<Asset>, page: usize, page_size: usize) -> PaginatedAssets {
    let total = assets.len();
    let total_pages = (total + page_size - 1) / page_size; // Ceiling division
    
    // Validasi page number
    let current_page = if page < 1 { 1 } else { page };
    
    let start = (current_page - 1) * page_size;
    let end = std::cmp::min(start + page_size, total);
    
    let paginated_assets = if start < total {
        assets[start..end].to_vec()
    } else {
        Vec::new()
    };
    
    PaginatedAssets {
        assets: paginated_assets,
        total,
        page: current_page,
        page_size,
        total_pages,
    }
}

// --- FUNGSI UTAMA (Public Commands) ---
#[tauri::command]
fn list_images(folder_path: String, page: usize, page_size: usize, query: Option<String>) -> PaginatedAssets {
    let assets = scan_folder_by_extensions(&folder_path, &["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"]);
    let filtered_assets = filter_assets_by_query(assets, query);
    paginate_assets(filtered_assets, page, page_size)
}

#[tauri::command]
fn list_videos(folder_path: String, page: usize, page_size: usize, query: Option<String>) -> PaginatedAssets {
    let assets = scan_folder_by_extensions(&folder_path, &["mp4", "mov", "mkv", "webm", "avi", "m4v"]);
    let filtered_assets = filter_assets_by_query(assets, query);
    paginate_assets(filtered_assets, page, page_size)
}

#[tauri::command]
fn list_musics(folder_path: String, page: usize, page_size: usize, query: Option<String>) -> PaginatedAssets {
    let assets = scan_folder_by_extensions(&folder_path, &["mp3", "wav", "ogg", "flac", "m4a", "aac"]);
    let filtered_assets = filter_assets_by_query(assets, query);
    paginate_assets(filtered_assets, page, page_size)
}

#[tauri::command]
fn list_sounds(folder_path: String, page: usize, page_size: usize, query: Option<String>) -> PaginatedAssets {
    let assets = scan_folder_by_extensions(&folder_path, &["mp3", "wav", "ogg", "flac", "aif", "aiff"]);
    let filtered_assets = filter_assets_by_query(assets, query);
    paginate_assets(filtered_assets, page, page_size)
}

struct DbState {
    conn: Mutex<Connection>,
}

// --- 3. Tauri Commands (API untuk React) ---

// CREATE
#[tauri::command]
fn add_asset(state: State<DbState>, name: String, path: Option<String>, size: Option<i64>) -> Result<(), String> {
    let conn = state.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO assets (name, path, size) VALUES (?1, ?2, ?3)",
        (&name, path.unwrap_or_default(), size.unwrap_or(0)),
    ).map_err(|e| e.to_string())?;
    Ok(())
}

// READ
#[tauri::command]
fn get_assets(state: State<DbState>) -> Result<Vec<Asset>, String> {
    let conn = state.conn.lock().unwrap();
    
    let mut stmt = conn.prepare("SELECT id, name, path, size FROM assets").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        Ok(Asset {
            id: row.get(0)?,
            name: row.get(1)?,
            path: row.get(2)?,
            size: row.get(3)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut assets = Vec::new();
    for row in rows {
        assets.push(row.map_err(|e| e.to_string())?);
    }
    Ok(assets)
}

// --- REGISTER ---
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
        tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            // A. Tentukan lokasi database (di folder AppData user)
            let app_data_dir = app.path().app_data_dir().unwrap();
            std::fs::create_dir_all(&app_data_dir).unwrap();
            let db_path = app_data_dir.join("my_database.db");

            // B. Buka Koneksi
            let conn = Connection::open(db_path).unwrap();

            // C. RAHASIA PERFORMA: Aktifkan WAL Mode (Write-Ahead Logging)
            // Tanpa ini, app akan crash "Database Locked" kalau scan file di background
            conn.pragma_update(None, "journal_mode", "WAL").unwrap();
            conn.pragma_update(None, "synchronous", "NORMAL").unwrap();

            // D. Buat Tabel jika belum ada
            conn.execute(
                "CREATE TABLE IF NOT EXISTS assets (
                    id INTEGER PRIMARY KEY,
                    name TEXT NOT NULL,
                    path TEXT NOT NULL DEFAULT '',
                    size INTEGER NOT NULL DEFAULT 0
                )",
                (),
            ).unwrap();

            // E. Migration: Add missing columns if they don't exist
            // Check if path column exists, if not add it
            let has_path: Result<i32, rusqlite::Error> = conn.query_row(
                "SELECT COUNT(*) FROM pragma_table_info('assets') WHERE name='path'",
                [],
                |row| row.get(0)
            );
            
            if let Ok(0) = has_path {
                conn.execute("ALTER TABLE assets ADD COLUMN path TEXT NOT NULL DEFAULT ''", ()).unwrap();
            }

            // Check if size column exists, if not add it
            let has_size: Result<i32, rusqlite::Error> = conn.query_row(
                "SELECT COUNT(*) FROM pragma_table_info('assets') WHERE name='size'",
                [],
                |row| row.get(0)
            );
            
            if let Ok(0) = has_size {
                conn.execute("ALTER TABLE assets ADD COLUMN size INTEGER NOT NULL DEFAULT 0", ()).unwrap();
            }

            // E. Simpan koneksi ke State Tauri
            app.manage(DbState { conn: Mutex::new(conn) });

            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_drag::init())
        .invoke_handler(tauri::generate_handler![
            list_images,
            list_videos,
            list_musics,
            list_sounds,
            add_asset,
            get_assets,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}