use rusqlite::Connection;
use std::collections::HashSet;
use tauri::State;

use crate::models::DbState;

pub fn is_schema_valid(conn: &Connection) -> bool {
    // Check assets table structure
    let assets_valid = check_table_schema(
        conn,
        "assets",
        vec![
            ("id", "INTEGER"),
            ("filename", "TEXT"),
            ("extension", "TEXT"),
            ("original_path", "TEXT"),
            ("type", "TEXT"),
            ("thumbnail_path", "TEXT"),
            ("duration_sec", "REAL"),
            ("file_size", "INTEGER"),
            ("waveform_data", "TEXT"),
            ("metadata", "TEXT"),
            ("tags", "TEXT"),
        ],
    );

    assets_valid
}

fn check_table_schema(
    conn: &Connection,
    table_name: &str,
    expected_columns: Vec<(&str, &str)>,
) -> bool {
    let mut stmt = match conn.prepare(&format!("PRAGMA table_info({})", table_name)) {
        Ok(s) => s,
        Err(_) => return false,
    };

    let existing_columns: HashSet<String> = stmt
        .query_map([], |row| row.get::<_, String>(1)) // Index 1 is column name
        .unwrap()
        .filter_map(|c| c.ok())
        .collect();

    if existing_columns.is_empty() {
        return true; // Table doesn't exist yet, let CREATE TABLE IF NOT EXISTS work
    }

    let expected_column_names: HashSet<String> = expected_columns
        .iter()
        .map(|(name, _)| name.to_string())
        .collect();

    // Check if all expected columns exist
    let all_expected_present = expected_column_names.is_subset(&existing_columns);

    // Check if there are no extra unexpected columns
    let no_extra_columns = existing_columns.is_subset(&expected_column_names);

    all_expected_present && no_extra_columns
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

#[tauri::command]
pub fn get_available_tags(state: State<'_, DbState>) -> Result<Vec<String>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("SELECT tags FROM assets WHERE tags IS NOT NULL AND tags != ''")
        .map_err(|e| e.to_string())?;

    let tag_iter = stmt
        .query_map([], |row| {
            let tags_string: String = row.get(0)?;
            Ok(tags_string)
        })
        .map_err(|e| e.to_string())?;

    let mut unique_tags = std::collections::HashSet::new();
    for tag_result in tag_iter {
        let tags_string = tag_result.map_err(|e| e.to_string())?;

        // Split comma-separated tags and add each tag to the set
        tags_string
            .split(',')
            .map(|tag| tag.trim())
            .filter(|tag| !tag.is_empty())
            .for_each(|tag| {
                unique_tags.insert(tag.to_string());
            });
    }

    let mut sorted_tags: Vec<String> = unique_tags.into_iter().collect();
    sorted_tags.sort();

    Ok(sorted_tags)
}

#[tauri::command]
pub fn update_asset_tags(
    state: State<'_, DbState>,
    asset_id: i64,
    tags: Option<String>,
) -> Result<String, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE assets SET tags = ?1 WHERE id = ?2",
        rusqlite::params![tags, asset_id],
    )
    .map_err(|e| e.to_string())?;

    Ok("Tags updated successfully".to_string())
}
