use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetDto {
    pub id: i64,
    pub filename: String,
    pub extension: String,
    pub original_path: String,
    pub type_name: String,
    pub thumbnail_path: Option<String>,
    pub file_size: i64,
    pub mtime_ms: i64,
    pub tags: Vec<String>,
    pub waveform_data: Option<Vec<f32>>,
    pub date_modified: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetsQueryInput {
    pub cursor: Option<i64>,
    pub page: Option<u32>,
    pub limit: Option<u32>,
    pub search: Option<String>,
    pub asset_type: Option<String>,
    pub tags: Option<Vec<String>>,
    pub sort_by: Option<String>,
    pub sort_order: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetsQueryResult {
    pub data: Vec<AssetDto>,
    pub next_cursor: Option<i64>,
    pub total_items: u64,
    pub total_pages: u32,
    pub current_page: u32,
    pub page_size: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JobDto {
    pub id: i64,
    pub job_type: String,
    pub status: String,
    pub priority: i64,
    pub attempts: i64,
    pub payload: String,
    pub last_error: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JobEvent {
    pub id: i64,
    pub job_type: String,
    pub status: String,
    pub message: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MutationInput {
    pub action: String,
    pub asset_id: Option<i64>,
    pub path: Option<String>,
    pub new_name: Option<String>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrimInput {
    pub asset_id: i64,
    pub start_sec: f64,
    pub end_sec: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DependencyStatus {
    pub yt_dlp_installed: bool,
    pub ffmpeg_installed: bool,
    pub ffprobe_installed: bool,
    pub deno_installed: bool,
    pub yt_dlp_path: Option<String>,
    pub ffmpeg_path: Option<String>,
    pub ffprobe_path: Option<String>,
    pub deno_path: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgress {
    pub scan_id: String,
    pub count: usize,
    pub last_file: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanRootDto {
    pub root_path: String,
    pub date_added: String,
    pub date_last_scanned: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RootCleanupResult {
    pub removed_root: String,
    pub deleted_assets: usize,
    pub deleted_jobs: usize,
}
