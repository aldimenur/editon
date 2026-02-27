use rusqlite::Connection;
use sqlx::SqlitePool;
use std::sync::{atomic::AtomicBool, Arc, Mutex};

#[derive(Clone)]
pub struct AppState {
    pub db_pool: SqlitePool,
    pub conn: Arc<Mutex<Connection>>,
    pub cancel_scan: Arc<AtomicBool>,
    pub worker_shutdown: Arc<AtomicBool>,
    pub active_scan_id: Arc<Mutex<Option<String>>>,
    pub active_scan_root_path: Arc<Mutex<Option<String>>>,
}
