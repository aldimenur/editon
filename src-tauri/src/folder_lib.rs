use notify::{Event, EventKind, RecursiveMode, Result as NotifyResult, Watcher};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use tauri::{AppHandle, Emitter, State};
use tokio::fs;
use walkdir::WalkDir;

use crate::{models::DbState, utils::get_media_type};

// Global state to manage the active watcher
lazy_static::lazy_static! {
    static ref WATCHER_STATE: Arc<Mutex<WatcherState>> = Arc::new(Mutex::new(WatcherState::new()));
}

struct WatcherState {
    handle: Option<JoinHandle<()>>,
    shutdown_tx: Option<std::sync::mpsc::Sender<()>>,
}

impl WatcherState {
    fn new() -> Self {
        Self {
            handle: None,
            shutdown_tx: None,
        }
    }

    fn is_running(&self) -> bool {
        self.handle.is_some()
    }

    fn stop(&mut self) -> Result<(), String> {
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(()); // Send shutdown signal
        }

        if let Some(handle) = self.handle.take() {
            // Wait for the watcher thread to finish (with timeout)
            match handle.join() {
                Ok(_) => Ok(()),
                Err(_) => Err("Failed to join watcher thread".to_string()),
            }
        } else {
            Ok(())
        }
    }

    fn start(&mut self, handle: JoinHandle<()>, shutdown_tx: std::sync::mpsc::Sender<()>) {
        // Stop any existing watcher first
        let _ = self.stop();

        self.handle = Some(handle);
        self.shutdown_tx = Some(shutdown_tx);
    }
}

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
    std::thread::sleep(std::time::Duration::from_millis(100));
    let db_conn = state.conn.clone();
    let app = app.clone();

    std::thread::spawn(move || {
        let mut total_count: usize = 0;

        for entry in WalkDir::new(&folder_path)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }

            if let Some(ext_os) = path.extension() {
                let ext_str = ext_os.to_string_lossy().to_string();
                if let Some(media_type) = get_media_type(&ext_str) {
                    let filename = path
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default();
                    let path_str = path.to_string_lossy().to_string();
                    let file_size = entry.metadata().map(|m| m.len()).unwrap_or(0);

                    if let Err(e) = add_or_update_file_in_db(
                        &db_conn,
                        &filename,
                        &ext_str,
                        &path_str,
                        &media_type,
                        file_size,
                    ) {
                        eprintln!("Error saving file {}: {}", path_str, e);
                    } else {
                        total_count += 1;
                        let _ = app.emit(
                            "scan-progress",
                            ScanProgress {
                                count: total_count,
                                last_file: filename.clone(),
                                status: "processing".into(),
                            },
                        );
                    }
                }
            }
        }

        let _ = app.emit(
            "scan-progress",
            ScanProgress {
                count: total_count,
                last_file: "".into(),
                status: "finished".into(),
            },
        );
    });

    Ok("Scan berjalan di background".to_string())
}

#[tauri::command]
pub fn trigger_folder_watcher(
    app: AppHandle,
    state: State<'_, DbState>,
    folder_path: String,
) -> Result<String, String> {
    let mut watcher_state = WATCHER_STATE.lock().map_err(|e| e.to_string())?;

    // Stop any existing watcher before starting a new one
    if watcher_state.is_running() {
        watcher_state.stop()?;
    }

    let db_conn = state.conn.clone();
    let (handle, shutdown_tx) = start_folder_watcher(folder_path, db_conn, app);
    watcher_state.start(handle, shutdown_tx);
    Ok("Folder watcher started".to_string())
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

#[tauri::command]
pub async fn rename_file(old_path: String, new_name: String) -> Result<String, String> {
    let old_path_buf = Path::new(&old_path);

    // 1. Dapatkan folder induk agar file baru tetap di folder yang sama
    let parent = old_path_buf
        .parent()
        .ok_or("Gagal mendapatkan folder induk")?;

    let new_path = parent.join(new_name);

    // 2. Eksekusi Rename secara Async
    fs::rename(&old_path, &new_path)
        .await
        .map_err(|e| format!("Gagal mengubah nama file: {}", e))?;

    // 3. Kembalikan path baru ke frontend (opsional)
    Ok(new_path.to_string_lossy().into_owned())
}

fn start_folder_watcher(
    folder_path: String,
    db_conn: Arc<Mutex<rusqlite::Connection>>,
    app: AppHandle,
) -> (JoinHandle<()>, std::sync::mpsc::Sender<()>) {
    let (shutdown_tx, shutdown_rx) = std::sync::mpsc::channel();

    let handle = std::thread::spawn(move || {
        if let Err(e) = watch_folder_changes(&folder_path, &db_conn, &app, shutdown_rx) {
            eprintln!("Folder watcher error: {}", e);
        }
    });

    (handle, shutdown_tx)
}

fn watch_folder_changes(
    folder_path: &str,
    db_conn: &Arc<Mutex<rusqlite::Connection>>,
    app: &AppHandle,
    shutdown_rx: std::sync::mpsc::Receiver<()>,
) -> NotifyResult<()> {
    let (tx, rx) = std::sync::mpsc::channel();
    let mut watcher = notify::recommended_watcher(tx)?;

    watcher.watch(Path::new(folder_path), RecursiveMode::Recursive)?;

    let db_conn = db_conn.clone();
    let app = app.clone();

    // Track rename operations (From -> To)
    let mut rename_from: Option<PathBuf> = None;

    // Debounce duplicate events (file system emits multiple events for single operations)
    use std::collections::HashMap;
    let mut last_event_time: HashMap<PathBuf, std::time::Instant> = HashMap::new();
    const DEBOUNCE_MS: u128 = 200; // Ignore duplicate events within 200ms

    // Process events in a loop
    loop {
        // Check for shutdown signal first (non-blocking)
        match shutdown_rx.try_recv() {
            Ok(()) | Err(std::sync::mpsc::TryRecvError::Disconnected) => {
                println!("Folder watcher stopping...");
                break;
            }
            Err(std::sync::mpsc::TryRecvError::Empty) => {
                // Continue processing events
            }
        }

        // Use recv_timeout to periodically check shutdown signal
        match rx.recv_timeout(std::time::Duration::from_millis(100)) {
            Ok(event) => match event {
                Ok(event) => {
                    // Filter out duplicate rapid events on the same path
                    let mut should_process = true;
                    if let Some(first_path) = event.paths.first() {
                        if let Some(last_time) = last_event_time.get(first_path) {
                            let elapsed = last_time.elapsed().as_millis();
                            if elapsed < DEBOUNCE_MS {
                                should_process = false;
                            }
                        }
                        if should_process {
                            last_event_time.insert(first_path.clone(), std::time::Instant::now());
                        }
                    }

                    if should_process {
                        handle_file_change(&event, &db_conn, &app, &mut rename_from);
                    }
                }
                Err(e) => eprintln!("Watch error: {}", e),
            },
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                // No event received, continue loop to check shutdown signal
                continue;
            }
            Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                // Channel disconnected, exit loop
                eprintln!("Watcher channel disconnected");
                break;
            }
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
    use notify::event::{ModifyKind, RenameMode};

    match &event.kind {
        EventKind::Modify(ModifyKind::Name(RenameMode::From)) => {
            println!("Rename Mode From");
            if let Some(path) = event.paths.first() {
                *rename_from = Some(path.clone());
            }
        }
        EventKind::Modify(ModifyKind::Name(RenameMode::To)) => {
            handle_rename_to(event, db_conn, app, rename_from);
            println!("\"Rename To: Rename From {:?}\"", rename_from)
        }
        EventKind::Create(_) => {
            println!("File Change");
            handle_create(event, db_conn, app);
        }
        EventKind::Modify(_) => {
            handle_modify(event, db_conn, app);
            println!("Metadata modified")
        }
        EventKind::Remove(_) => {
            println!("File Removed!");
            handle_remove(event, db_conn, app);
        }
        _ => {}
    }
}

/// Stores path and metadata for a media file; returns None if not a valid media file or metadata fails.
fn media_file_info(path: &Path) -> Option<(String, String, String, String, u64)> {
    if !path.is_file() {
        return None;
    }
    let ext = path.extension()?.to_string_lossy().to_string();
    let media_type = get_media_type(&ext)?;
    let metadata = path.metadata().ok()?;
    let filename = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    let path_str = path.to_string_lossy().to_string();
    Some((filename, ext, path_str, media_type, metadata.len()))
}

fn handle_rename_to(
    event: &Event,
    db_conn: &Arc<Mutex<rusqlite::Connection>>,
    app: &AppHandle,
    rename_from: &mut Option<PathBuf>,
) {
    let new_path = match event.paths.first() {
        Some(p) => p,
        None => return,
    };
    let old_path = rename_from.take();

    if let Some((filename, ext_str, new_path_str, media_type, file_size)) =
        media_file_info(new_path)
    {
        if let Some(ref old) = old_path {
            let old_path_str = old.to_string_lossy().to_string();
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
            let _ = replace_file_in_db(
                db_conn,
                &filename,
                &ext_str,
                &new_path_str,
                &media_type,
                file_size,
            );
        }
        return;
    }

    if let Some(old) = old_path {
        let old_path_str = old.to_string_lossy().to_string();
        if let Err(e) = remove_file_from_db(db_conn, &old_path_str) {
            eprintln!("Error removing renamed path from DB: {}", e);
        }
    }
}

fn handle_create(event: &Event, db_conn: &Arc<Mutex<rusqlite::Connection>>, app: &AppHandle) {
    for path in &event.paths {
        let Some((filename, ext_str, path_str, media_type, file_size)) = media_file_info(path)
        else {
            continue;
        };
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
            let _ = app.emit("file-added", (&filename, &media_type));
        }
    }
}

fn handle_modify(event: &Event, db_conn: &Arc<Mutex<rusqlite::Connection>>, app: &AppHandle) {
    for path in &event.paths {
        let Some((filename, ext_str, path_str, media_type, file_size)) = media_file_info(path)
        else {
            continue;
        };
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
            let _ = app.emit("file-added", (&filename, &media_type));
        }
    }
}

fn handle_remove(event: &Event, db_conn: &Arc<Mutex<rusqlite::Connection>>, app: &AppHandle) {
    for path in &event.paths {
        let path_str = path.to_string_lossy().to_string();
        if let Err(e) = remove_file_from_db(db_conn, &path_str) {
            eprintln!("Error removing from DB: {}", e);
        } else {
            let _ = app.emit("file-removed", &path_str);
        }
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
    } else {
        // File doesn't exist, insert as new
        conn.execute(
            "INSERT INTO assets (filename, extension, original_path, type, file_size, metadata, duration_sec) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![filename, ext, path, media_type, size as i64, "{}", 0.0],
        )
        .map_err(|e| e.to_string())?;
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
    } else {
        // Old path not in database, insert as new file
        conn.execute(
            "INSERT INTO assets (filename, extension, original_path, type, file_size, metadata, duration_sec) 
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![new_filename, new_ext, new_path, media_type, size as i64, "{}", 0.0],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}
