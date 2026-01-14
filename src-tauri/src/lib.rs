use std::fs;
use std::path::Path;
use serde::{Serialize, Deserialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Asset {
    name: String,
    path: String,
    size: u64,
}

// --- HELPER FUNCTION (Private) ---
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

// --- 4 FUNGSI UTAMA (Public Commands) ---

#[tauri::command]
fn list_images(folder_path: String) -> Vec<Asset> {
    // Daftar ekstensi gambar
    scan_folder_by_extensions(&folder_path, &["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"])
}

#[tauri::command]
fn list_videos(folder_path: String) -> Vec<Asset> {
    // Daftar ekstensi video
    scan_folder_by_extensions(&folder_path, &["mp4", "mov", "mkv", "webm", "avi", "m4v"])
}

#[tauri::command]
fn list_musics(folder_path: String) -> Vec<Asset> {
    // Ekstensi sama dengan sound, tapi User yang menentukan foldernya
    scan_folder_by_extensions(&folder_path, &["mp3", "wav", "ogg", "flac", "m4a", "aac"])
}

#[tauri::command]
fn list_sounds(folder_path: String) -> Vec<Asset> {
    // Ekstensi sama dengan music
    scan_folder_by_extensions(&folder_path, &["mp3", "wav", "ogg", "flac", "aif", "aiff"])
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
            list_sounds
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}