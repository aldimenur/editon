use tauri::{AppHandle, Emitter, State};
use walkdir::WalkDir;

use crate::{models::DbState, utils::get_media_type};

#[tauri::command]
pub fn show_in_folder(path: String) {
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
        if let Some(parent) = std::path::Path::new(&path).parent() {
            let _ = open::that(parent);
        }
    }
}

#[derive(Clone, serde::Serialize)]
struct ScanProgress {
    count: usize,
    last_file: String,
    status: String, // "processing", "saving", "finished"
}

#[tauri::command]
pub fn scan_and_import_folder(
    app: AppHandle, // Tambahkan AppHandle untuk emit event
    state: State<'_, DbState>,
    folder_path: String,
) -> Result<String, String> {
    // Clone Arc agar bisa dipindah ke thread lain
    let db_conn = state.conn.clone();

    // Jalankan di thread terpisah agar tidak memblokir main thread/UI
    std::thread::spawn(move || {
        let batch_size = 50; // Simpan ke DB setiap 50 file
        let mut batch = Vec::new();
        let mut total_count = 0;

        for entry in WalkDir::new(&folder_path)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            let path = entry.path();
            if path.is_file() {
                if let Some(ext_os) = path.extension() {
                    let ext_str = ext_os.to_string_lossy().to_string();
                    if let Some(media_type) = get_media_type(&ext_str) {
                        // Kumpulkan data dulu (jangan lock DB saat baca file system)
                        let filename = path.file_name().unwrap().to_string_lossy().to_string();
                        let path_str = path.to_string_lossy().to_string();
                        let file_size = entry.metadata().map(|m| m.len()).unwrap_or(0);

                        batch.push((filename, ext_str, path_str, media_type, file_size));

                        // Jika batch penuh, simpan ke DB
                        if batch.len() >= batch_size {
                            if let Err(e) = save_batch(&db_conn, &batch) {
                                println!("Error saving batch: {}", e);
                            }
                            total_count += batch.len();

                            // Emit event progress
                            let _ = app.emit(
                                "scan-progress",
                                ScanProgress {
                                    count: total_count,
                                    last_file: batch.last().unwrap().0.clone(),
                                    status: "processing".into(),
                                },
                            );

                            batch.clear();
                            // Lock DB otomatis terlepas di sini
                        }
                    }
                }
            }
        }

        // Simpan sisa batch terakhir
        if !batch.is_empty() {
            if let Err(e) = save_batch(&db_conn, &batch) {
                println!("Error saving last batch: {}", e);
            }
            total_count += batch.len();
        }

        // Emit event selesai
        let _ = app.emit(
            "scan-progress",
            ScanProgress {
                count: total_count,
                last_file: "".into(),
                status: "finished".into(),
            },
        );
    });

    // Return langsung agar UI tidak menunggu
    Ok("Scan berjalan di background".to_string())
}

// Helper function untuk menyimpan batch (Transaction scope kecil)
fn save_batch(
    conn: &std::sync::Arc<std::sync::Mutex<rusqlite::Connection>>,
    batch: &Vec<(String, String, String, String, u64)>,
) -> Result<(), String> {
    let mut conn = conn.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    {
        let mut stmt = tx
            .prepare_cached(
                "INSERT OR IGNORE INTO assets 
            (filename, extension, original_path, type, file_size, metadata, duration_sec) 
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            )
            .map_err(|e| e.to_string())?;

        for (filename, ext, path, media_type, size) in batch {
            stmt.execute(rusqlite::params![
                filename,
                ext,
                path,
                media_type,
                *size as i64,
                "{}",
                0.0,
            ])
            .map_err(|e| e.to_string())?;
        }
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}
