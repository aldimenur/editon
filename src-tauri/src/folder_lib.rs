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
        // Fallback untuk OS lain (buka foldernya saja)
        if let Some(parent) = std::path::Path::new(&path).parent() {
            let _ = open::that(parent); // Bisa pakai crate 'open' biar simpel
        }
    }
}

#[tauri::command]
pub fn scan_and_import_folder(
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
