use std::fs;
use serde::{Serialize, Deserialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Asset {
    name: String,
    path: String,
    size: u64,
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
    
    if let Ok(entries) = fs::read_dir(folder_path) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(ext) = path.extension() {
                    let ext_str = ext.to_str().unwrap_or("").to_lowercase();
                    // Cek apakah ekstensi ada di daftar yang diinginkan
                    if valid_extensions.contains(&ext_str.as_str()) {
                        assets.push(Asset {
                            name: entry.file_name().to_string_lossy().to_string(),
                            path: path.to_string_lossy().to_string(),
                            size: entry.metadata().unwrap().len(),
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

// --- REGISTER ---
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            list_images, 
            list_videos, 
            list_musics, 
            list_sounds,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}