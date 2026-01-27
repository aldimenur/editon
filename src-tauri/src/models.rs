use std::sync::{atomic::AtomicBool, Arc, Mutex};

use rusqlite::Connection;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
#[serde(untagged)] // Biar otomatis deteksi varian berdasarkan isi field-nya
pub enum AssetMetadata {
    Audio {
        sample_rate: u32,
        bitrate: u32,
        artist: Option<String>,
    },
    Video {
        width: u32,
        height: u32,
        fps: f32,
    },
    Image {
        width: u32,
        height: u32,
        format: String,
    },
    None,
}

#[derive(Clone, Serialize)]
pub struct ProgressEvent {
    pub name: String,
    pub current: usize,
    pub total: usize,
    pub filename: String,
    pub status: String, // "processing" atau "done"
}

// Struct Utama
#[derive(Debug, Serialize, Deserialize)]
pub struct Asset {
    pub id: Option<i64>, // Option karena saat insert ID belum ada (auto increment)
    pub filename: String,
    pub extension: String,
    pub original_path: String,
    pub type_name: String, // 'audio', 'video', 'image'

    pub thumbnail_path: Option<String>,
    pub duration_sec: f64,
    pub file_size: i64,

    // Waveform disimpan sebagai bytes binary
    pub waveform_data: Option<Vec<f32>>,

    // Metadata fleksibel
    pub metadata: AssetMetadata,
}

#[derive(Debug, Serialize)]
pub struct PaginatedResponse {
    pub data: Vec<Asset>,
    pub total_items: u64,
    pub total_pages: u64,
    pub current_page: u32,
}

pub struct DbState {
    pub conn: Arc<Mutex<Connection>>,
    pub cancel_scan: Arc<AtomicBool>,
}

#[derive(Serialize)]
pub struct ApiResponse {
    pub message: String,
    pub status: String,
}
