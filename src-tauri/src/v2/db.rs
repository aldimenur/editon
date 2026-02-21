use rusqlite::Connection;
use std::{fs, path::PathBuf};
use tauri::{AppHandle, Manager};

pub fn init_database(app: &AppHandle) -> Result<Connection, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;
    fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("Failed to create app data dir: {}", e))?;
    let db_path = app_data_dir.join("editon_v2.db");

    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| e.to_string())?;
    conn.pragma_update(None, "synchronous", "NORMAL")
        .map_err(|e| e.to_string())?;

    create_schema(&conn)?;
    Ok(conn)
}

pub fn get_bin_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;
    let bin_dir = app_data_dir.join("bin");
    if !bin_dir.exists() {
        fs::create_dir_all(&bin_dir).map_err(|e| e.to_string())?;
    }
    Ok(bin_dir)
}

fn create_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS assets (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            filename        TEXT NOT NULL,
            extension       TEXT NOT NULL,
            original_path   TEXT NOT NULL UNIQUE,
            type            TEXT NOT NULL,
            file_size       INTEGER NOT NULL DEFAULT 0,
            mtime_ms        INTEGER NOT NULL DEFAULT 0,
            fingerprint     TEXT,
            tags            TEXT,
            date_created    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            date_modified   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS asset_media_info (
            asset_id        INTEGER PRIMARY KEY,
            duration_sec    REAL,
            width           INTEGER,
            height          INTEGER,
            codec           TEXT,
            sample_rate     INTEGER,
            bitrate         INTEGER,
            FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS asset_previews (
            asset_id             INTEGER PRIMARY KEY,
            thumbnail_path       TEXT,
            waveform_path        TEXT,
            waveform_data        TEXT,
            waveform_bars        INTEGER,
            generator_version    TEXT,
            waveform_mtime_ms    INTEGER,
            generated_at         TEXT,
            FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS tags (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            name            TEXT NOT NULL UNIQUE
        );

        CREATE TABLE IF NOT EXISTS asset_tags (
            asset_id         INTEGER NOT NULL,
            tag_id           INTEGER NOT NULL,
            PRIMARY KEY (asset_id, tag_id),
            FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE,
            FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS jobs (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            job_type        TEXT NOT NULL,
            payload         TEXT NOT NULL,
            status          TEXT NOT NULL DEFAULT 'queued',
            priority        INTEGER NOT NULL DEFAULT 10,
            attempts        INTEGER NOT NULL DEFAULT 0,
            max_attempts    INTEGER NOT NULL DEFAULT 3,
            last_error      TEXT,
            run_after       TEXT,
            started_at      TEXT,
            finished_at     TEXT,
            created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_assets_type_id ON assets(type, id DESC);
        CREATE INDEX IF NOT EXISTS idx_assets_modified ON assets(date_modified DESC);
        CREATE INDEX IF NOT EXISTS idx_jobs_status_priority ON jobs(status, priority, id);

        CREATE VIRTUAL TABLE IF NOT EXISTS assets_fts USING fts5(
            filename,
            original_path,
            tags,
            content='assets',
            content_rowid='id'
        );

        CREATE TRIGGER IF NOT EXISTS assets_ai AFTER INSERT ON assets BEGIN
          INSERT INTO assets_fts(rowid, filename, original_path, tags)
          VALUES (new.id, new.filename, new.original_path, COALESCE(new.tags, ''));
        END;

        CREATE TRIGGER IF NOT EXISTS assets_ad AFTER DELETE ON assets BEGIN
          INSERT INTO assets_fts(assets_fts, rowid, filename, original_path, tags)
          VALUES ('delete', old.id, old.filename, old.original_path, COALESCE(old.tags, ''));
        END;

        CREATE TRIGGER IF NOT EXISTS assets_au AFTER UPDATE ON assets BEGIN
          INSERT INTO assets_fts(assets_fts, rowid, filename, original_path, tags)
          VALUES ('delete', old.id, old.filename, old.original_path, COALESCE(old.tags, ''));
          INSERT INTO assets_fts(rowid, filename, original_path, tags)
          VALUES (new.id, new.filename, new.original_path, COALESCE(new.tags, ''));
        END;
        "#,
    )
    .map_err(|e| e.to_string())?;

    ensure_preview_columns(conn)?;

    Ok(())
}

fn ensure_preview_columns(conn: &Connection) -> Result<(), String> {
    let mut has_waveform_data = false;
    let mut has_waveform_bars = false;
    let mut has_waveform_mtime_ms = false;

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

    Ok(())
}

pub fn classify_media_type(ext: &str) -> Option<String> {
    match ext.to_lowercase().as_str() {
        "jpg" | "jpeg" | "png" | "webp" | "gif" | "bmp" | "svg" | "ico" => {
            Some("image".to_string())
        }
        "mp4" | "mkv" | "mov" | "avi" | "webm" | "flv" | "wmv" => Some("video".to_string()),
        "mp3" | "wav" | "ogg" | "flac" | "aac" | "m4a" | "wma" | "aiff" => {
            Some("audio".to_string())
        }
        _ => None,
    }
}
