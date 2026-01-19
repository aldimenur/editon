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

// CREATE - Add single asset
#[tauri::command]
fn add_asset(state: State<DbState>, name: String, path: String, size: i64) -> Result<i64, String> {
    let conn = state.conn.lock().unwrap();
    conn.execute(
        "INSERT INTO assets (name, path, size) VALUES (?1, ?2, ?3)",
        (&name, &path, size),
    ).map_err(|e| e.to_string())?;
    
    // Return the ID of the newly inserted asset
    Ok(conn.last_insert_rowid())
}

// CREATE - Add multiple assets at once (bulk insert)
#[tauri::command]
fn add_assets_bulk(state: State<DbState>, assets: Vec<Asset>) -> Result<usize, String> {
    let conn = state.conn.lock().unwrap();
    
    // Use a transaction for better performance
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    
    let mut count = 0;
    for asset in assets {
        tx.execute(
            "INSERT INTO assets (name, path, size) VALUES (?1, ?2, ?3)",
            (&asset.name, &asset.path, asset.size),
        ).map_err(|e| e.to_string())?;
        count += 1;
    }
    
    tx.commit().map_err(|e| e.to_string())?;
    Ok(count)
}

// CREATE - Scan folder and add assets to database
#[tauri::command]
fn scan_and_add_assets(
    state: State<DbState>, 
    folder_path: String, 
    asset_type: String
) -> Result<usize, String> {
    // Determine valid extensions based on asset type
    let valid_extensions: &[&str] = match asset_type.as_str() {
        "image" => &["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"],
        "video" => &["mp4", "mov", "mkv", "webm", "avi", "m4v"],
        "music" => &["mp3", "wav", "ogg", "flac", "m4a", "aac"],
        "sound" => &["mp3", "wav", "ogg", "flac", "aif", "aiff"],
        _ => return Err("Invalid asset type. Use: image, video, music, or sound".to_string()),
    };
    
    // Scan the folder
    let assets = scan_folder_by_extensions(&folder_path, valid_extensions);
    
    if assets.is_empty() {
        return Ok(0);
    }
    
    // Add to database using bulk insert
    let conn = state.conn.lock().unwrap();
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    
    let mut count = 0;
    for asset in assets {
        // Check if asset already exists (by path)
        let exists: Result<i32, rusqlite::Error> = tx.query_row(
            "SELECT COUNT(*) FROM assets WHERE path = ?1",
            [&asset.path],
            |row| row.get(0)
        );
        
        // Only insert if it doesn't exist
        if let Ok(0) = exists {
            tx.execute(
                "INSERT INTO assets (name, path, size) VALUES (?1, ?2, ?3)",
                (&asset.name, &asset.path, asset.size),
            ).map_err(|e| e.to_string())?;
            count += 1;
        }
    }
    
    tx.commit().map_err(|e| e.to_string())?;
    Ok(count)
}

// SYNC - Synchronize database with folder contents
#[derive(Debug, Serialize, Deserialize)]
pub struct SyncResult {
    added: usize,
    updated: usize,
    removed: usize,
    total: usize,
}

#[tauri::command]
fn sync_assets(
    state: State<DbState>, 
    folder_path: String, 
    asset_type: String
) -> Result<SyncResult, String> {
    // Determine valid extensions based on asset type
    let valid_extensions: &[&str] = match asset_type.as_str() {
        "image" => &["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"],
        "video" => &["mp4", "mov", "mkv", "webm", "avi", "m4v"],
        "music" => &["mp3", "wav", "ogg", "flac", "m4a", "aac"],
        "sound" => &["mp3", "wav", "ogg", "flac", "aif", "aiff"],
        _ => return Err("Invalid asset type. Use: image, video, music, or sound".to_string()),
    };
    
    // Scan the folder to get current files
    let scanned_assets = scan_folder_by_extensions(&folder_path, valid_extensions);
    
    let conn = state.conn.lock().unwrap();
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    
    let mut added = 0;
    let mut updated = 0;
    
    // Create a HashSet of scanned file paths for quick lookup
    use std::collections::HashSet;
    let scanned_paths: HashSet<String> = scanned_assets.iter()
        .map(|a| a.path.clone())
        .collect();
    
    // Step 1: Add new assets or update existing ones
    for asset in &scanned_assets {
        // Check if asset exists in database
        let exists: Result<(i32, i64), rusqlite::Error> = tx.query_row(
            "SELECT id, size FROM assets WHERE path = ?1",
            [&asset.path],
            |row| Ok((row.get(0)?, row.get(1)?))
        );
        
        match exists {
            Ok((_id, db_size)) => {
                // Asset exists - check if size changed (file was modified)
                if db_size != asset.size {
                    tx.execute(
                        "UPDATE assets SET name = ?1, size = ?2 WHERE path = ?3",
                        (&asset.name, asset.size, &asset.path),
                    ).map_err(|e| e.to_string())?;
                    updated += 1;
                }
            },
            Err(_) => {
                // Asset doesn't exist - add it
                tx.execute(
                    "INSERT INTO assets (name, path, size) VALUES (?1, ?2, ?3)",
                    (&asset.name, &asset.path, asset.size),
                ).map_err(|e| e.to_string())?;
                added += 1;
            }
        }
    }
    
    // Step 2: Remove assets that no longer exist in the folder
    let mut paths_to_remove = Vec::new();
    {
        let mut stmt = tx.prepare("SELECT id, path FROM assets").map_err(|e| e.to_string())?;
        let db_assets = stmt.query_map([], |row| {
            Ok((row.get::<_, i32>(0)?, row.get::<_, String>(1)?))
        }).map_err(|e| e.to_string())?;
        
        for asset in db_assets {
            let (_, path) = asset.map_err(|e| e.to_string())?;
            if !scanned_paths.contains(&path) {
                paths_to_remove.push(path);
            }
        }
    } // stmt is dropped here, releasing the borrow on tx
    
    let removed = paths_to_remove.len();
    for path in paths_to_remove {
        tx.execute("DELETE FROM assets WHERE path = ?1", [&path])
            .map_err(|e| e.to_string())?;
    }
    
    tx.commit().map_err(|e| e.to_string())?;
    
    // Get total count after sync
    let total_count: i64 = conn.query_row("SELECT COUNT(*) FROM assets", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    
    Ok(SyncResult {
        added,
        updated,
        removed,
        total: total_count as usize,
    })
}

// READ
#[tauri::command]
fn get_assets(state: State<DbState>, page: u32, page_size: u32, query: Option<String>) -> Result<PaginatedAssets, String> {
    let conn = state.conn.lock().unwrap();

    // Build WHERE clause based on query
    let (where_clause, search_param) = match query {
        Some(q) if !q.trim().is_empty() => {
            let search_pattern = format!("%{}%", q.trim());
            ("WHERE name LIKE ?1", Some(search_pattern))
        },
        _ => ("", None)
    };

    // Get total count with search filter
    let count_query = format!("SELECT COUNT(*) FROM assets {}", where_clause);
    let total_count: i64 = if let Some(ref param) = search_param {
        conn.query_row(&count_query, [param], |row| row.get(0))
            .map_err(|e| e.to_string())?
    } else {
        conn.query_row(&count_query, [], |row| row.get(0))
            .map_err(|e| e.to_string())?
    };
    let total = total_count as usize;

    let offset = (page - 1) * page_size;
    let limit = page_size;

    // Build main query with search filter
    let select_query = format!("SELECT id, name, path, size FROM assets {} ORDER BY id LIMIT ? OFFSET ?", where_clause);
    
    let mut stmt = conn.prepare(&select_query).map_err(|e| e.to_string())?;
    
    let mut assets = Vec::new();
    
    if let Some(ref param) = search_param {
        let rows = stmt.query_map(rusqlite::params![param, limit, offset], |row| {
            Ok(Asset {
                id: row.get(0)?,
                name: row.get(1)?,
                path: row.get(2)?,
                size: row.get(3)?,
            })
        }).map_err(|e| e.to_string())?;
        
        for row in rows {
            assets.push(row.map_err(|e| e.to_string())?);
        }
    } else {
        let rows = stmt.query_map(rusqlite::params![limit, offset], |row| {
            Ok(Asset {
                id: row.get(0)?,
                name: row.get(1)?,
                path: row.get(2)?,
                size: row.get(3)?,
            })
        }).map_err(|e| e.to_string())?;
        
        for row in rows {
            assets.push(row.map_err(|e| e.to_string())?);
        }
    }
    
    let total_pages = (total + page_size as usize - 1) / page_size as usize;
    
    Ok(PaginatedAssets {
        assets,
        total,
        page: page as usize,
        page_size: page_size as usize,
        total_pages,
    })
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
            add_assets_bulk,
            scan_and_add_assets,
            sync_assets,
            get_assets,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}