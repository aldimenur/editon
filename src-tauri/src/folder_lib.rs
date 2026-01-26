use tauri::{AppHandle, Emitter, State};
use walkdir::WalkDir;
use notify::{Watcher, RecursiveMode, Result as NotifyResult, Event, EventKind};
use std::sync::{Arc, Mutex};
use std::path::{Path};

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

        // Start folder watcher after initial scan completes
        println!("Starting folder watcher for: {}", folder_path);
        start_folder_watcher(folder_path, db_conn, app);
    });

    // Return langsung agar UI tidak menunggu
    Ok("Scan berjalan di background".to_string())
}

// Start watching folder for file changes
fn start_folder_watcher(folder_path: String, db_conn: Arc<Mutex<rusqlite::Connection>>, app: AppHandle) {
    std::thread::spawn(move || {
        if let Err(e) = watch_folder_changes(&folder_path, &db_conn, &app) {
            eprintln!("Folder watcher error: {}", e);
        }
    });
}

// Watch folder for file system changes
fn watch_folder_changes(
    folder_path: &str,
    db_conn: &Arc<Mutex<rusqlite::Connection>>,
    app: &AppHandle,
) -> NotifyResult<()> {
    let (tx, rx) = std::sync::mpsc::channel();
    let mut watcher = notify::recommended_watcher(tx)?;
    
    watcher.watch(Path::new(folder_path), RecursiveMode::Recursive)?;
    
    let db_conn = db_conn.clone();
    let app = app.clone();
    
    // Process events in a loop
    for event in rx {
        match event {
            Ok(event) => {
                handle_file_change(&event, &db_conn, &app);
            }
            Err(e) => eprintln!("Watch error: {}", e),
        }
    }
    
    Ok(())
}

// Handle individual file events
fn handle_file_change(
    event: &Event,
    db_conn: &Arc<Mutex<rusqlite::Connection>>,
    app: &AppHandle,
) {
    match &event.kind {
        // File created or modified
        EventKind::Create(_) | EventKind::Modify(_) => {
            for path in &event.paths {
                if path.is_file() {
                    if let Some(ext) = path.extension() {
                        let ext_str = ext.to_string_lossy().to_string();
                        
                        // Only process files that match media types
                        if let Some(media_type) = get_media_type(&ext_str) {
                            if let Ok(metadata) = path.metadata() {
                                let filename = path.file_name()
                                    .unwrap_or_default()
                                    .to_string_lossy()
                                    .to_string();
                                let path_str = path.to_string_lossy().to_string();
                                let file_size = metadata.len();
                                
                                // Add or update file in database
                                if let Err(e) = add_or_update_file_in_db(
                                    db_conn,
                                    &filename,
                                    &ext_str,
                                    &path_str,
                                    &media_type,
                                    file_size,
                                ) {
                                    eprintln!("Error updating DB for {}: {}", path_str, e);
                                } else {
                                    // Emit event to notify UI
                                    let _ = app.emit("file-added", (&filename, &media_type));
                                }
                            }
                        }
                    }
                }
            }
        }
        
        // File deleted
        EventKind::Remove(_) => {
            for path in &event.paths {
                let path_str = path.to_string_lossy().to_string();
                if let Err(e) = remove_file_from_db(db_conn, &path_str) {
                    eprintln!("Error removing from DB: {}", e);
                } else {
                    let _ = app.emit("file-removed", &path_str);
                }
            }
        }
        
        _ => {} // Ignore other event types (rename, chmod, etc.)
    }
}

// Add or update file in database (used by watcher)
fn add_or_update_file_in_db(
    conn: &Arc<Mutex<rusqlite::Connection>>,
    filename: &str,
    ext: &str,
    path: &str,
    media_type: &str,
    size: u64,
) -> Result<(), String> {
    let mut conn = conn.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    // Try to insert first (if file is new)
    let result = tx.execute(
        "INSERT INTO assets (filename, extension, original_path, type, file_size, metadata, duration_sec) 
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![filename, ext, path, media_type, size as i64, "{}", 0.0],
    );

    match result {
        Ok(_) => {
            tx.commit().map_err(|e| e.to_string())?;
            Ok(())
        }
        Err(rusqlite::Error::SqliteFailure(_, Some(msg))) if msg.contains("UNIQUE constraint failed") => {
            // File already exists, update it
            tx.execute(
                "UPDATE assets SET file_size = ?1 WHERE original_path = ?2",
                rusqlite::params![size as i64, path],
            )
            .map_err(|e| e.to_string())?;
            tx.commit().map_err(|e| e.to_string())?;
            Ok(())
        }
        Err(e) => Err(e.to_string()),
    }
}

// Remove file from database (used by watcher)
fn remove_file_from_db(
    conn: &Arc<Mutex<rusqlite::Connection>>,
    path: &str,
) -> Result<(), String> {
    let conn = conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM assets WHERE original_path = ?1",
        rusqlite::params![path],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
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
