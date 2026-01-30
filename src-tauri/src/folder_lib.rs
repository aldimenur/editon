use notify::{Event, EventKind, RecursiveMode, Result as NotifyResult, Watcher};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, State};
use tokio::fs;
use walkdir::WalkDir;

use crate::{models::DbState, utils::get_media_type};

#[derive(Clone, serde::Serialize)]
struct ScanProgress {
    count: usize,
    last_file: String,
    status: String, // "processing", "saving", "finished"
}

#[derive(Clone, serde::Serialize)]
struct FileRenamedPayload {
    old_path: String,
    new_path: String,
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

#[tauri::command]
pub fn trigger_folder_watcher(
    app: AppHandle, // Tambahkan AppHandle untuk emit event
    state: State<'_, DbState>,
    folder_path: String,
) -> Result<String, String> {
    let db_conn = state.conn.clone();

    println!("Trigger folder watcher for: {}", folder_path);
    start_folder_watcher(folder_path, db_conn, app);
    Ok("Scan berjalan di background".to_string())
}

#[tauri::command]
pub async fn delete_file(path: String) -> Result<String, String> {
    let target_path = Path::new(&path);

    // Cek keberadaan file (masih bisa pakai std::path untuk cek path)
    if !target_path.exists() {
        return Err("File tidak ditemukan".to_string());
    }

    // Eksekusi penghapusan secara ASYNC
    fs::remove_file(target_path)
        .await // <--- Penting: menunggu proses hapus selesai tanpa nge-lag
        .map_err(|e| format!("Gagal menghapus file: {}", e))?;

    Ok(format!("Sukses menghapus: {}", path))
}

fn start_folder_watcher(
    folder_path: String,
    db_conn: Arc<Mutex<rusqlite::Connection>>,
    app: AppHandle,
) {
    std::thread::spawn(move || {
        if let Err(e) = watch_folder_changes(&folder_path, &db_conn, &app) {
            eprintln!("Folder watcher error: {}", e);
        }
    });
}

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

    // Track rename operations (From -> To)
    let mut rename_from: Option<PathBuf> = None;

    // Process events in a loop
    for event in rx {
        match event {
            Ok(event) => {
                handle_file_change(&event, &db_conn, &app, &mut rename_from);
            }
            Err(e) => eprintln!("Watch error: {}", e),
        }
    }

    Ok(())
}

fn handle_file_change(
    event: &Event,
    db_conn: &Arc<Mutex<rusqlite::Connection>>,
    app: &AppHandle,
    rename_from: &mut Option<PathBuf>,
) {
    // Debug: Log all events to see what's actually being fired
    println!(
        "Event kind: {:?}, path count: {}",
        event.kind,
        event.paths.len()
    );
    for (i, path) in event.paths.iter().enumerate() {
        println!("  Path[{}]: {}", i, path.display());
    }

    match &event.kind {
        // Handle rename "From" event - store the old path
        EventKind::Modify(notify::event::ModifyKind::Name(notify::event::RenameMode::From)) => {
            if let Some(path) = event.paths.first() {
                println!("==> Rename FROM detected: {}", path.display());
                *rename_from = Some(path.clone());
            }
            return;
        }

        // Handle rename "To" event - update database with new path
        EventKind::Modify(notify::event::ModifyKind::Name(notify::event::RenameMode::To)) => {
            if let Some(new_path) = event.paths.first() {
                println!("==> Rename TO detected: {}", new_path.display());

                // Get the old path if available
                let old_path = rename_from.take();

                // Process the new path
                if new_path.is_file() {
                    if let Some(ext) = new_path.extension() {
                        let ext_str = ext.to_string_lossy().to_string();

                        if let Some(media_type) = get_media_type(&ext_str) {
                            if let Ok(metadata) = new_path.metadata() {
                                let filename = new_path
                                    .file_name()
                                    .unwrap_or_default()
                                    .to_string_lossy()
                                    .to_string();
                                let new_path_str = new_path.to_string_lossy().to_string();
                                let file_size = metadata.len();

                                // Handle rename in database
                                if let Some(old_path) = old_path {
                                    let old_path_str = old_path.to_string_lossy().to_string();

                                    if let Err(e) = handle_rename_in_db(
                                        db_conn,
                                        &old_path_str,
                                        &new_path_str,
                                        &filename,
                                        &ext_str,
                                        &media_type,
                                        file_size,
                                    ) {
                                        eprintln!("Error handling rename in DB: {}", e);
                                    } else {
                                        let _ = app.emit(
                                            "file-renamed",
                                            FileRenamedPayload {
                                                old_path: old_path_str,
                                                new_path: new_path_str,
                                            },
                                        );
                                    }
                                } else {
                                    // No old path, treat as new file
                                    let _ = replace_file_in_db(
                                        db_conn,
                                        &filename,
                                        &ext_str,
                                        &new_path_str,
                                        &media_type,
                                        file_size,
                                    );
                                }
                            }
                        } else if let Some(old_path) = old_path {
                            // Renamed to non-media file, remove from DB
                            let old_path_str = old_path.to_string_lossy().to_string();
                            let _ = remove_file_from_db(db_conn, &old_path_str);
                        }
                    }
                } else if let Some(old_path) = old_path {
                    // File no longer exists, remove from DB
                    let old_path_str = old_path.to_string_lossy().to_string();
                    let _ = remove_file_from_db(db_conn, &old_path_str);
                }
            }
            return;
        }

        // File created or modified (non-rename modifications)
        EventKind::Create(_) | EventKind::Modify(_) => {
            println!("==> Create/Modify event handler (fallback)");
            for path in &event.paths {
                if path.is_file() {
                    if let Some(ext) = path.extension() {
                        let ext_str = ext.to_string_lossy().to_string();

                        // Only process files that match media types
                        if let Some(media_type) = get_media_type(&ext_str) {
                            if let Ok(metadata) = path.metadata() {
                                let filename = path
                                    .file_name()
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
            println!("==> Remove event handler");
            for path in &event.paths {
                let path_str = path.to_string_lossy().to_string();
                if let Err(e) = remove_file_from_db(db_conn, &path_str) {
                    eprintln!("Error removing from DB: {}", e);
                } else {
                    let _ = app.emit("file-removed", &path_str);
                }
            }
        }

        _ => {} // Ignore other event types (chmod, etc.)
    }
}

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
        Err(rusqlite::Error::SqliteFailure(_, Some(msg)))
            if msg.contains("UNIQUE constraint failed") =>
        {
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

fn remove_file_from_db(conn: &Arc<Mutex<rusqlite::Connection>>, path: &str) -> Result<(), String> {
    let conn = conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM assets WHERE original_path = ?1",
        rusqlite::params![path],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn replace_file_in_db(
    conn: &Arc<Mutex<rusqlite::Connection>>,
    filename: &str,
    ext: &str,
    path: &str,
    media_type: &str,
    size: u64,
) -> Result<(), String> {
    let conn = conn.lock().map_err(|e| e.to_string())?;

    // Check if file exists in database with the current path
    let exists: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM assets WHERE original_path = ?1)",
            rusqlite::params![path],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    if exists {
        // File exists, replace the row with new data
        conn.execute(
            "UPDATE assets SET filename = ?1, extension = ?2, type = ?3, file_size = ?4 
             WHERE original_path = ?5",
            rusqlite::params![filename, ext, media_type, size as i64, path],
        )
        .map_err(|e| e.to_string())?;
        println!("✓ File replaced in DB: {}", path);
    } else {
        // File doesn't exist, insert as new
        conn.execute(
            "INSERT INTO assets (filename, extension, original_path, type, file_size, metadata, duration_sec) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![filename, ext, path, media_type, size as i64, "{}", 0.0],
        )
        .map_err(|e| e.to_string())?;
        println!("✓ File inserted in DB: {}", path);
    }

    Ok(())
}

fn handle_rename_in_db(
    conn: &Arc<Mutex<rusqlite::Connection>>,
    old_path: &str,
    new_path: &str,
    new_filename: &str,
    new_ext: &str,
    media_type: &str,
    size: u64,
) -> Result<(), String> {
    let conn = conn.lock().map_err(|e| e.to_string())?;

    // Check if old path exists in database
    let exists: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM assets WHERE original_path = ?1)",
            rusqlite::params![old_path],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    if exists {
        // Update existing record with new path and name
        conn.execute(
            "UPDATE assets SET filename = ?1, extension = ?2, original_path = ?3, type = ?4, file_size = ?5 
             WHERE original_path = ?6",
            rusqlite::params![new_filename, new_ext, new_path, media_type, size as i64, old_path],
        )
        .map_err(|e| e.to_string())?;
        println!("✓ File renamed in DB: {} -> {}", old_path, new_path);
    } else {
        // Old path not in database, insert as new file
        conn.execute(
            "INSERT INTO assets (filename, extension, original_path, type, file_size, metadata, duration_sec) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![new_filename, new_ext, new_path, media_type, size as i64, "{}", 0.0],
        )
        .map_err(|e| e.to_string())?;
        println!("✓ File inserted in DB (old path not found): {}", new_path);
    }

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
