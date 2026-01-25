use rusqlite::{Connection};
use tauri::State;
use std::collections::HashSet;

use crate::models::DbState;

pub fn is_schema_valid(conn: &Connection) -> bool {
    // Ambil info kolom dari tabel assets
    let mut stmt = match conn.prepare("PRAGMA table_info(assets)") {
        Ok(s) => s,
        Err(_) => return false,
    };

    let existing_columns: HashSet<String> = stmt
        .query_map([], |row| row.get::<_, String>(1)) // Index 1 adalah nama kolom
        .unwrap()
        .filter_map(|c| c.ok())
        .collect();

    if existing_columns.is_empty() {
        return true; // Tabel belum ada, biarkan 'CREATE TABLE IF NOT EXISTS' yang bekerja
    }

    // Daftar kolom yang wajib ada sesuai skema baru
    let expected_columns_vec = vec![
        "id",
        "filename",
        "extension",
        "original_path",
        "type",
        "thumbnail_path",
        "duration_sec",
        "file_size",
        "waveform_data",
        "metadata",
    ];
    let expected_columns: HashSet<String> = expected_columns_vec
        .into_iter()
        .map(|s| s.to_string())
        .collect();

    // Periksa apakah semua kolom yang diharapkan ada di database
    let all_expected_cols_present = expected_columns.is_subset(&existing_columns);

    // Periksa apakah tidak ada kolom tambahan di database yang tidak diharapkan
    let no_extra_cols_present = existing_columns.is_subset(&expected_columns);

    all_expected_cols_present && no_extra_cols_present
}

#[tauri::command]
pub fn clear_db(state: State<'_, DbState>) -> Result<String, String> {
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;

    tx.execute("DELETE FROM assets", [])
        .map_err(|e| e.to_string())?;

    tx.execute("DELETE FROM sqlite_sequence WHERE name='assets'", [])
        .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;

    Ok("Database cleared".to_string())
}