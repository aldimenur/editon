use rusqlite::Connection;
use std::path::Path;

pub fn sqlite_url_from_path(path: &Path) -> String {
    let raw = path.to_string_lossy().replace('\\', "/");
    format!("sqlite://{}", raw)
}

pub fn apply_legacy_pragmas(conn: &Connection) -> Result<(), String> {
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| e.to_string())?;
    conn.pragma_update(None, "synchronous", "NORMAL")
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn ensure_legacy_compat_columns(conn: &Connection) -> Result<(), String> {
    ensure_assets_root_path_column(conn)?;
    ensure_preview_columns(conn)?;
    ensure_jobs_cancellation_column(conn)?;
    Ok(())
}

fn ensure_assets_root_path_column(conn: &Connection) -> Result<(), String> {
    let mut has_root_path = false;

    let mut stmt = conn
        .prepare("PRAGMA table_info(assets)")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|e| e.to_string())?;

    for row in rows {
        let name = row.map_err(|e| e.to_string())?;
        if name == "root_path" {
            has_root_path = true;
            break;
        }
    }

    if !has_root_path {
        conn.execute("ALTER TABLE assets ADD COLUMN root_path TEXT", [])
            .map_err(|e| e.to_string())?;
    }

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_assets_root_path ON assets(root_path)",
        [],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

fn ensure_preview_columns(conn: &Connection) -> Result<(), String> {
    let mut has_waveform_data = false;
    let mut has_waveform_bars = false;
    let mut has_waveform_mtime_ms = false;
    let mut has_thumbnail_mtime_ms = false;
    let mut has_thumbnail_version = false;

    let mut stmt = conn
        .prepare("PRAGMA table_info(asset_previews)")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|e| e.to_string())?;

    for row in rows {
        let name = row.map_err(|e| e.to_string())?;
        if name == "waveform_data" {
            has_waveform_data = true;
        }
        if name == "waveform_bars" {
            has_waveform_bars = true;
        }
        if name == "waveform_mtime_ms" {
            has_waveform_mtime_ms = true;
        }
        if name == "thumbnail_mtime_ms" {
            has_thumbnail_mtime_ms = true;
        }
        if name == "thumbnail_version" {
            has_thumbnail_version = true;
        }
    }

    if !has_waveform_data {
        conn.execute(
            "ALTER TABLE asset_previews ADD COLUMN waveform_data TEXT",
            [],
        )
        .map_err(|e| e.to_string())?;
    }
    if !has_waveform_bars {
        conn.execute(
            "ALTER TABLE asset_previews ADD COLUMN waveform_bars INTEGER",
            [],
        )
        .map_err(|e| e.to_string())?;
    }
    if !has_waveform_mtime_ms {
        conn.execute(
            "ALTER TABLE asset_previews ADD COLUMN waveform_mtime_ms INTEGER",
            [],
        )
        .map_err(|e| e.to_string())?;
    }
    if !has_thumbnail_mtime_ms {
        conn.execute(
            "ALTER TABLE asset_previews ADD COLUMN thumbnail_mtime_ms INTEGER",
            [],
        )
        .map_err(|e| e.to_string())?;
    }
    if !has_thumbnail_version {
        conn.execute(
            "ALTER TABLE asset_previews ADD COLUMN thumbnail_version TEXT",
            [],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

fn ensure_jobs_cancellation_column(conn: &Connection) -> Result<(), String> {
    let mut has_column = false;
    let mut stmt = conn
        .prepare("PRAGMA table_info(jobs)")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|e| e.to_string())?;

    for row in rows {
        let name = row.map_err(|e| e.to_string())?;
        if name == "cancellation_requested" {
            has_column = true;
            break;
        }
    }

    if !has_column {
        conn.execute(
            "ALTER TABLE jobs ADD COLUMN cancellation_requested INTEGER NOT NULL DEFAULT 0",
            [],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}
