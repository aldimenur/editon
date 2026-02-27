pub mod schema;

use rusqlite::Connection;
use sqlx::migrate::Migrator;
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous};
use sqlx::SqlitePool;
use std::str::FromStr;
use std::{fs, path::PathBuf};
use tauri::{AppHandle, Manager};

static MIGRATOR: Migrator = sqlx::migrate!("./src/v2/db/migrations");

pub struct DatabaseHandles {
    pub pool: SqlitePool,
    pub legacy_conn: Connection,
}

pub async fn init_database(app: &AppHandle) -> Result<DatabaseHandles, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;
    fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("Failed to create app data dir: {}", e))?;

    let db_path = app_data_dir.join("editon_v2.db");
    let db_url = schema::sqlite_url_from_path(&db_path);

    let options = SqliteConnectOptions::from_str(&db_url)
        .map_err(|e| e.to_string())?
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Normal);

    let pool = SqlitePoolOptions::new()
        .max_connections(8)
        .connect_with(options)
        .await
        .map_err(|e| e.to_string())?;

    MIGRATOR.run(&pool).await.map_err(|e| e.to_string())?;

    let legacy_conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    schema::apply_legacy_pragmas(&legacy_conn)?;
    schema::ensure_legacy_compat_columns(&legacy_conn)?;

    Ok(DatabaseHandles { pool, legacy_conn })
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

pub fn get_thumbnail_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;
    let dir = app_data_dir.join("thumbnails");
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(dir)
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
