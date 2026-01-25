use tauri::State;
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

#[tauri::command]
pub fn scan_and_import_folder(
    state: State<'_, DbState>,
    folder_path: String,
) -> Result<String, String> {
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let mut count = 0;

    {
        let mut stmt = tx
            .prepare_cached(
                "INSERT OR IGNORE INTO assets 
            (filename, extension, original_path, type, file_size, metadata, duration_sec) 
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            )
            .map_err(|e| e.to_string())?;

        for entry in WalkDir::new(&folder_path)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            let path = entry.path();

            if path.is_file() {
                if let Some(ext_os) = path.extension() {
                    let ext_str = ext_os.to_string_lossy().to_string();

                    if let Some(media_type) = get_media_type(&ext_str) {
                        let filename = path.file_name().unwrap().to_string_lossy().to_string();
                        let path_str = path.to_string_lossy().to_string();
                        let file_size = entry.metadata().map(|m| m.len()).unwrap_or(0);

                        stmt.execute(rusqlite::params![
                            filename,
                            ext_str,
                            path_str,
                            media_type,
                            file_size as i64,
                            "{}",
                            0.0,
                        ])
                        .map_err(|e| e.to_string())?;

                        count += 1;
                    }
                }
            }
        }
    }

    tx.commit().map_err(|e| e.to_string())?;

    Ok(format!("Berhasil scan: {} file baru ditambahkan.", count))
}
