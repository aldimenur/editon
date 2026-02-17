use rusqlite::Connection;
use std::collections::HashSet;
use tauri::State;

use crate::models::DbState;

pub fn is_schema_valid(conn: &Connection) -> bool {
    // Check assets table structure

    check_table_schema(
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
            ("date_created", "TEXT"),
            ("date_modified", "TEXT"),
        ],
    )
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

    let existing_columns: HashSet<String> = match stmt.query_map([], |row| row.get::<_, String>(1))
    {
        Ok(rows) => rows.filter_map(|c| c.ok()).collect(),
        Err(_) => return false,
    };

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

fn normalize_tags(tags: Option<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut normalized = Vec::new();

    if let Some(raw) = tags {
        for tag in raw
            .split(',')
            .map(|tag| tag.trim())
            .filter(|tag| !tag.is_empty())
        {
            let canonical = tag.to_lowercase();
            if seen.insert(canonical.clone()) {
                normalized.push(canonical);
            }
        }
    }

    normalized
}

fn tags_to_csv(tags: &[String]) -> Option<String> {
    if tags.is_empty() {
        None
    } else {
        Some(tags.join(", "))
    }
}

fn upsert_asset_tags(
    tx: &rusqlite::Transaction<'_>,
    asset_id: i64,
    tags: &[String],
) -> Result<(), String> {
    tx.execute(
        "DELETE FROM asset_tags WHERE asset_id = ?1",
        rusqlite::params![asset_id],
    )
    .map_err(|e| e.to_string())?;

    for tag in tags {
        tx.execute(
            "INSERT INTO tags(name) VALUES (?1) ON CONFLICT(name) DO NOTHING",
            rusqlite::params![tag],
        )
        .map_err(|e| e.to_string())?;

        let tag_id: i64 = tx
            .query_row(
                "SELECT id FROM tags WHERE name = ?1",
                rusqlite::params![tag],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;

        tx.execute(
            "INSERT OR IGNORE INTO asset_tags(asset_id, tag_id) VALUES (?1, ?2)",
            rusqlite::params![asset_id, tag_id],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

pub fn ensure_tag_schema(conn: &mut Connection) -> Result<(), String> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS tags (
            id      INTEGER PRIMARY KEY AUTOINCREMENT,
            name    TEXT NOT NULL UNIQUE
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS asset_tags (
            asset_id INTEGER NOT NULL,
            tag_id   INTEGER NOT NULL,
            PRIMARY KEY (asset_id, tag_id),
            FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE,
            FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_asset_tags_asset_id ON asset_tags(asset_id)",
        [],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_asset_tags_tag_id ON asset_tags(tag_id)",
        [],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_name ON tags(name)",
        [],
    )
    .map_err(|e| e.to_string())?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM asset_tags", [])
        .map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM tags", [])
        .map_err(|e| e.to_string())?;

    let assets_with_tags: Vec<(i64, Option<String>)> = {
        let mut stmt = tx
            .prepare("SELECT id, tags FROM assets")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, Option<String>>(1)?))
            })
            .map_err(|e| e.to_string())?;
        rows.filter_map(|row| row.ok()).collect()
    };

    for (asset_id, tags) in assets_with_tags {
        let normalized = normalize_tags(tags);
        upsert_asset_tags(&tx, asset_id, &normalized)?;

        tx.execute(
            "UPDATE assets SET tags = ?1 WHERE id = ?2",
            rusqlite::params![tags_to_csv(&normalized), asset_id],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
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
        .prepare("SELECT name FROM tags ORDER BY name ASC")
        .map_err(|e| e.to_string())?;

    let tag_iter = stmt
        .query_map([], |row| {
            let tag_name: String = row.get(0)?;
            Ok(tag_name)
        })
        .map_err(|e| e.to_string())?;

    let mut tags = Vec::new();
    for tag_result in tag_iter {
        tags.push(tag_result.map_err(|e| e.to_string())?);
    }

    Ok(tags)
}

#[tauri::command]
pub fn update_asset_tags(
    state: State<'_, DbState>,
    asset_id: i64,
    tags: Option<String>,
) -> Result<String, String> {
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let normalized_tags = normalize_tags(tags);
    let tags_csv = tags_to_csv(&normalized_tags);

    tx.execute(
        "UPDATE assets SET tags = ?1, date_modified = CURRENT_TIMESTAMP WHERE id = ?2",
        rusqlite::params![tags_csv, asset_id],
    )
    .map_err(|e| e.to_string())?;

    upsert_asset_tags(&tx, asset_id, &normalized_tags)?;
    tx.commit().map_err(|e| e.to_string())?;

    Ok("Tags updated successfully".to_string())
}

#[tauri::command]
pub fn update_assets_tags(
    state: State<'_, DbState>,
    asset_ids: Vec<i64>,
    tags: Option<String>,
) -> Result<String, String> {
    if asset_ids.is_empty() {
        return Err("No asset IDs provided".to_string());
    }

    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let normalized_tags = normalize_tags(tags);
    let tags_csv = tags_to_csv(&normalized_tags);

    let mut stmt = tx
        .prepare("UPDATE assets SET tags = ?1, date_modified = CURRENT_TIMESTAMP WHERE id = ?2")
        .map_err(|e| e.to_string())?;
    let tags_csv_ref = tags_csv.as_deref();

    for asset_id in asset_ids {
        stmt.execute(rusqlite::params![tags_csv_ref, asset_id])
            .map_err(|e| e.to_string())?;
        upsert_asset_tags(&tx, asset_id, &normalized_tags)?;
    }

    drop(stmt);
    tx.commit().map_err(|e| e.to_string())?;

    Ok("Tags updated successfully".to_string())
}
