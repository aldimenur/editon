use rusqlite::Connection;
use std::sync::{atomic::AtomicBool, Arc, Mutex};

pub struct AppState {
    pub conn: Arc<Mutex<Connection>>,
    pub cancel_scan: Arc<AtomicBool>,
    pub worker_shutdown: Arc<AtomicBool>,
    pub active_scan_id: Arc<Mutex<Option<String>>>,
}
