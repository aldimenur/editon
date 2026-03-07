mod db;
mod jobs;
mod models;
mod state;
mod waveform;

use crate::v2::db::{classify_media_type, get_bin_dir, get_thumbnail_dir, init_database};
use crate::v2::jobs::{cancel_job, enqueue_job, list_jobs, start_worker};
use crate::v2::models::{
    AssetDto, AssetsQueryInput, AssetsQueryResult, DependencyStatus, MutationInput,
    RootCleanupResult, ScanProgress, ScanRootDto, TrimInput, YtdlpDownloadInput,
    YtdlpProbeResult, YtdlpThumbnailOption,
};
use crate::v2::state::AppState;
use rusqlite::{params, ToSql};
use std::ffi::OsStr;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{atomic::Ordering, Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};
use walkdir::WalkDir;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

struct ActiveScanGuard {
    active_scan_id: Arc<Mutex<Option<String>>>,
    active_scan_root_path: Arc<Mutex<Option<String>>>,
    scan_id: String,
}

impl ActiveScanGuard {
    fn new(
        active_scan_id: Arc<Mutex<Option<String>>>,
        active_scan_root_path: Arc<Mutex<Option<String>>>,
        scan_id: String,
    ) -> Self {
        Self {
            active_scan_id,
            active_scan_root_path,
            scan_id,
        }
    }
}

impl Drop for ActiveScanGuard {
    fn drop(&mut self) {
        if let Ok(mut active) = self.active_scan_id.lock() {
            if active.as_deref() == Some(self.scan_id.as_str()) {
                *active = None;
            }
        }
        if let Ok(mut active_root_path) = self.active_scan_root_path.lock() {
            *active_root_path = None;
        }
    }
}

const WAVEFORM_VERSION: &str = "v2.1";
const WAVEFORM_BARS: usize = 192;
const THUMBNAIL_VERSION: &str = "v2.1";
const YT_DLP_WINDOWS_URL: &str =
    "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe";
const FFMPEG_WINDOWS_URL: &str = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-lgpl.zip";
const DENO_WINDOWS_URL: &str =
    "https://github.com/denoland/deno/releases/latest/download/deno-x86_64-pc-windows-msvc.zip";
const DEPENDENCY_DOWNLOAD_ATTEMPTS: usize = 4;
const DEPENDENCY_EXTRACT_ATTEMPTS: usize = 3;
const DEPENDENCY_REPLACE_ATTEMPTS: usize = 6;
const DEPENDENCY_RETRY_BASE_DELAY_MS: u64 = 600;
const SCAN_PROGRESS_EMIT_INTERVAL: Duration = Duration::from_millis(250);
const SCAN_PROGRESS_EMIT_EVERY_FILES: usize = 200;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

fn hidden_command(program: impl AsRef<OsStr>) -> Command {
    let mut command = Command::new(program);
    #[cfg(target_os = "windows")]
    {
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}

fn is_thumbnail_asset_type(asset_type: &str) -> bool {
    asset_type == "video" || asset_type == "image"
}

fn should_enqueue_thumbnail(asset_type: &str, is_missing: bool, is_fresh: bool) -> bool {
    is_thumbnail_asset_type(asset_type) && (is_missing || !is_fresh)
}

fn should_enqueue_thumbnail_for_asset(
    asset_type: &str,
    extension: &str,
    is_missing: bool,
    is_fresh: bool,
) -> bool {
    if asset_type == "image" && should_skip_image_thumbnail(extension) {
        return false;
    }
    should_enqueue_thumbnail(asset_type, is_missing, is_fresh)
}

fn should_capture_scanned_asset_for_job_enqueue(asset_type: &str) -> bool {
    asset_type == "audio" || is_thumbnail_asset_type(asset_type)
}

fn should_emit_scan_progress(count: usize, last_emit_at: &mut Instant) -> bool {
    if count <= 10 || count % SCAN_PROGRESS_EMIT_EVERY_FILES == 0 {
        *last_emit_at = Instant::now();
        return true;
    }

    if last_emit_at.elapsed() >= SCAN_PROGRESS_EMIT_INTERVAL {
        *last_emit_at = Instant::now();
        return true;
    }

    false
}

struct ScannedAssetRecord {
    filename: String,
    extension: String,
    original_path: String,
    media_type: String,
    file_size: i64,
    mtime_ms: i64,
    enqueue_preview_jobs: bool,
}

fn flush_scanned_assets_batch(
    db: &Arc<Mutex<rusqlite::Connection>>,
    root_path: &str,
    records: &[ScannedAssetRecord],
    queued_asset_ids: &mut Vec<i64>,
) -> Result<(), String> {
    if records.is_empty() {
        return Ok(());
    }

    let mut conn = db.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    for record in records {
        let asset_id = tx
            .query_row(
                "INSERT INTO assets(filename, extension, original_path, root_path, type, file_size, mtime_ms)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                 ON CONFLICT(original_path) DO UPDATE SET
                     filename = excluded.filename,
                     extension = excluded.extension,
                     root_path = excluded.root_path,
                     type = excluded.type,
                     file_size = excluded.file_size,
                     mtime_ms = excluded.mtime_ms,
                     date_modified = CURRENT_TIMESTAMP
                 RETURNING id",
                params![
                    record.filename,
                    record.extension,
                    record.original_path,
                    root_path,
                    record.media_type,
                    record.file_size,
                    record.mtime_ms
                ],
                |row| row.get::<_, i64>(0),
            )
            .map_err(|e| e.to_string())?;

        if record.enqueue_preview_jobs {
            queued_asset_ids.push(asset_id);
        }
    }

    tx.commit().map_err(|e| e.to_string())
}

fn flush_pending_scan_assets(
    db: &Arc<Mutex<rusqlite::Connection>>,
    root_path: &str,
    pending_assets: &mut Vec<ScannedAssetRecord>,
    pending_enqueue_ids: &mut Vec<i64>,
    state_for_jobs: &AppState,
) {
    if pending_assets.is_empty() {
        return;
    }

    let flush_result = flush_scanned_assets_batch(
        db,
        root_path,
        pending_assets.as_slice(),
        pending_enqueue_ids,
    );
    pending_assets.clear();

    if flush_result.is_err() {
        pending_enqueue_ids.clear();
        return;
    }

    for asset_id in pending_enqueue_ids.drain(..) {
        let _ = enqueue_waveform_job_if_needed(state_for_jobs, asset_id, 1);
        let _ = enqueue_video_thumbnail_job_if_needed(state_for_jobs, asset_id, 1);
    }
}

fn build_assets_fts_query(input: &str) -> Option<String> {
    let terms = input
        .split(|c: char| !c.is_alphanumeric())
        .map(str::trim)
        .filter(|term| !term.is_empty())
        .map(|term| term.to_lowercase())
        .collect::<Vec<_>>();

    if terms.is_empty() {
        return None;
    }

    Some(
        terms
            .iter()
            .map(|term| format!("{}*", term))
            .collect::<Vec<_>>()
            .join(" AND "),
    )
}

fn should_skip_image_thumbnail(extension: &str) -> bool {
    extension.eq_ignore_ascii_case("svg")
}

fn previous_thumbnail_to_remove(
    previous_thumbnail_path: Option<String>,
    next_thumbnail_path: &str,
) -> Option<String> {
    let previous_path = previous_thumbnail_path?.trim().to_string();
    if previous_path.is_empty() || previous_path == next_thumbnail_path {
        return None;
    }
    Some(previous_path)
}

fn thumbnail_dimensions(width: u32, height: u32, max_edge: u32) -> (u32, u32) {
    if width == 0 || height == 0 || max_edge == 0 {
        return (0, 0);
    }

    let current_max = width.max(height);
    if current_max <= max_edge {
        return (width, height);
    }

    let scale = max_edge as f64 / current_max as f64;
    let target_width = (width as f64 * scale).round().max(1.0) as u32;
    let target_height = (height as f64 * scale).round().max(1.0) as u32;
    (target_width, target_height)
}

fn parse_asset_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<AssetDto> {
    let thumbnail_path: Option<String> = row.get(5)?;
    let tags_csv: Option<String> = row.get(8)?;
    let waveform_json: Option<String> = row.get(10)?;
    let tags = tags_csv
        .unwrap_or_default()
        .split(',')
        .filter_map(|t| {
            let value = t.trim();
            if value.is_empty() {
                None
            } else {
                Some(value.to_string())
            }
        })
        .collect::<Vec<_>>();

    let waveform_data = match waveform_json {
        Some(value) if !value.trim().is_empty() => serde_json::from_str::<Vec<f32>>(&value).ok(),
        _ => None,
    };

    Ok(AssetDto {
        id: row.get(0)?,
        filename: row.get(1)?,
        extension: row.get(2)?,
        original_path: row.get(3)?,
        type_name: row.get(4)?,
        thumbnail_path,
        file_size: row.get(6)?,
        mtime_ms: row.get(7)?,
        tags,
        waveform_data,
        date_modified: row.get(9)?,
    })
}

pub fn setup(app: AppHandle) -> Result<AppState, String> {
    let db_handles = tauri::async_runtime::block_on(init_database(&app))?;
    let state = AppState {
        db_pool: db_handles.pool,
        conn: Arc::new(Mutex::new(db_handles.legacy_conn)),
        cancel_scan: Arc::new(std::sync::atomic::AtomicBool::new(false)),
        worker_shutdown: Arc::new(std::sync::atomic::AtomicBool::new(false)),
        active_scan_id: Arc::new(Mutex::new(None)),
        active_scan_root_path: Arc::new(Mutex::new(None)),
    };

    start_worker(app, state.clone());

    Ok(state)
}

#[tauri::command]
pub fn v2_scan_start(
    app: AppHandle,
    state: State<'_, AppState>,
    root_path: String,
) -> Result<String, String> {
    let normalized_root_path = normalize_root_path(&root_path);
    let path = Path::new(&normalized_root_path);
    if !path.exists() || !path.is_dir() {
        return Err("Scan root path is not a valid directory".to_string());
    }

    state.cancel_scan.store(false, Ordering::SeqCst);
    let scan_id = format!(
        "scan-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_millis()
    );
    {
        let mut active = state.active_scan_id.lock().map_err(|e| e.to_string())?;
        if active.is_some() {
            return Err("A scan is already running. Stop it before starting a new one.".to_string());
        }
        *active = Some(scan_id.clone());
    }
    {
        let mut active_root_path = state
            .active_scan_root_path
            .lock()
            .map_err(|e| e.to_string())?;
        *active_root_path = Some(normalized_root_path.clone());
    }

    let db = state.conn.clone();
    let cancel = state.cancel_scan.clone();
    let state_for_jobs = state.inner().clone();
    let emit_app = app.clone();
    let emit_scan_id = scan_id.clone();
    let root_path_for_db = normalized_root_path.clone();

    if let Ok(conn) = db.lock() {
        let _ = conn.execute(
            "INSERT INTO scan_roots(root_path, date_last_scanned)
             VALUES (?1, NULL)
             ON CONFLICT(root_path) DO NOTHING",
            params![root_path_for_db.clone()],
        );
    }

    std::thread::spawn(move || {
        let _active_scan_guard = ActiveScanGuard::new(
            state_for_jobs.active_scan_id.clone(),
            state_for_jobs.active_scan_root_path.clone(),
            emit_scan_id.clone(),
        );
        let mut count = 0usize;
        let mut cancelled = false;
        let mut pending_assets: Vec<ScannedAssetRecord> = Vec::with_capacity(96);
        let mut pending_enqueue_ids: Vec<i64> = Vec::with_capacity(96);
        let mut last_progress_emit_at = Instant::now();

        let scan_result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let _ = emit_app.emit(
                "v2-scan-progress",
                ScanProgress {
                    scan_id: emit_scan_id.clone(),
                    count,
                    last_file: "Scanning...".to_string(),
                    status: "processing".to_string(),
                },
            );

            for entry in WalkDir::new(&normalized_root_path)
                .into_iter()
                .filter_map(Result::ok)
            {
                if cancel.load(Ordering::SeqCst) {
                    flush_pending_scan_assets(
                        &db,
                        &root_path_for_db,
                        &mut pending_assets,
                        &mut pending_enqueue_ids,
                        &state_for_jobs,
                    );
                    cancelled = true;
                    let _ = emit_app.emit(
                        "v2-scan-progress",
                        ScanProgress {
                            scan_id: emit_scan_id.clone(),
                            count,
                            last_file: String::new(),
                            status: "cancelled".to_string(),
                        },
                    );
                    return;
                }

                let file_path = entry.path();
                if !file_path.is_file() {
                    continue;
                }

                let filename = file_path
                    .file_name()
                    .and_then(|x| x.to_str())
                    .unwrap_or_default()
                    .to_string();
                count += 1;

                if should_emit_scan_progress(count, &mut last_progress_emit_at) {
                    let _ = emit_app.emit(
                        "v2-scan-progress",
                        ScanProgress {
                            scan_id: emit_scan_id.clone(),
                            count,
                            last_file: filename.clone(),
                            status: "processing".to_string(),
                        },
                    );
                }

                let ext = match file_path.extension().and_then(|x| x.to_str()) {
                    Some(value) => value,
                    None => continue,
                };

                let media_type = match classify_media_type(ext) {
                    Some(value) => value,
                    None => continue,
                };

                let original_path = file_path.to_string_lossy().to_string();
                let metadata = match entry.metadata() {
                    Ok(value) => value,
                    Err(_) => continue,
                };
                let file_size = metadata.len() as i64;
                let mtime_ms = metadata
                    .modified()
                    .ok()
                    .and_then(|ts| ts.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_millis() as i64)
                    .unwrap_or(0);

                pending_assets.push(ScannedAssetRecord {
                    filename,
                    extension: ext.to_lowercase(),
                    original_path,
                    media_type: media_type.clone(),
                    file_size,
                    mtime_ms,
                    enqueue_preview_jobs: should_capture_scanned_asset_for_job_enqueue(&media_type),
                });

                if pending_assets.len() >= 96 {
                    flush_pending_scan_assets(
                        &db,
                        &root_path_for_db,
                        &mut pending_assets,
                        &mut pending_enqueue_ids,
                        &state_for_jobs,
                    );
                }
            }

            flush_pending_scan_assets(
                &db,
                &root_path_for_db,
                &mut pending_assets,
                &mut pending_enqueue_ids,
                &state_for_jobs,
            );
        }));

        match scan_result {
            Ok(()) if !cancelled => {
                let _ = emit_app.emit(
                    "v2-scan-progress",
                    ScanProgress {
                        scan_id: emit_scan_id,
                        count,
                        last_file: String::new(),
                        status: "done".to_string(),
                    },
                );

                if let Ok(conn) = db.lock() {
                    let _ = conn.execute(
                        "UPDATE scan_roots
                         SET date_last_scanned = CURRENT_TIMESTAMP
                         WHERE root_path = ?1",
                        params![root_path_for_db],
                    );
                }
            }
            Ok(()) => {}
            Err(_) => {
                let _ = emit_app.emit(
                    "v2-scan-progress",
                    ScanProgress {
                        scan_id: emit_scan_id,
                        count,
                        last_file: "Scan worker crashed".to_string(),
                        status: "failed".to_string(),
                    },
                );
            }
        }
    });

    Ok(scan_id)
}

#[tauri::command]
pub fn v2_scan_sync_root(
    app: AppHandle,
    state: State<'_, AppState>,
    root_path: String,
) -> Result<String, String> {
    v2_scan_start(app, state, root_path)
}

#[tauri::command]
pub fn v2_scan_stop(
    state: State<'_, AppState>,
    _scan_id: Option<String>,
) -> Result<String, String> {
    state.cancel_scan.store(true, Ordering::SeqCst);
    Ok("Scan cancellation requested".to_string())
}

#[tauri::command]
pub fn v2_scan_roots_list(state: State<'_, AppState>) -> Result<Vec<ScanRootDto>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT root_path, date_added, date_last_scanned
             FROM scan_roots
             ORDER BY COALESCE(date_last_scanned, date_added) DESC, id DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(ScanRootDto {
                root_path: row.get(0)?,
                date_added: row.get(1)?,
                date_last_scanned: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut roots = Vec::new();
    for row in rows {
        roots.push(row.map_err(|e| e.to_string())?);
    }

    Ok(roots)
}

#[tauri::command]
pub fn v2_scan_root_remove(
    state: State<'_, AppState>,
    root_path: String,
) -> Result<RootCleanupResult, String> {
    let normalized = normalize_root_path(&root_path);
    if normalized.is_empty() {
        return Err("Root path is required".to_string());
    }

    let normalized_like = format!("{}/%", normalized);

    let active_root_path = state
        .active_scan_root_path
        .lock()
        .map_err(|e| e.to_string())?
        .clone();
    if should_cancel_scan_for_removed_root(active_root_path.as_deref(), &normalized) {
        state.cancel_scan.store(true, Ordering::SeqCst);
        for _ in 0..50 {
            let active_scan_running = state
                .active_scan_id
                .lock()
                .map(|scan| scan.is_some())
                .unwrap_or(false);
            if !active_scan_running {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
    }

    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let deleted_jobs = tx
        .execute(
            "DELETE FROM jobs
             WHERE json_valid(payload) = 1
               AND json_extract(payload, '$.assetId') IN (
                 SELECT id FROM assets
                 WHERE REPLACE(COALESCE(root_path, ''), '\\', '/') = ?1
                    OR REPLACE(original_path, '\\', '/') = ?1
                    OR REPLACE(original_path, '\\', '/') LIKE ?2
               )",
            params![normalized.clone(), normalized_like.clone()],
        )
        .map_err(|e| e.to_string())?;

    let deleted_assets = tx
        .execute(
            "DELETE FROM assets
             WHERE REPLACE(COALESCE(root_path, ''), '\\', '/') = ?1
                OR REPLACE(original_path, '\\', '/') = ?1
                OR REPLACE(original_path, '\\', '/') LIKE ?2",
            params![normalized.clone(), normalized_like],
        )
        .map_err(|e| e.to_string())?;

    tx.execute(
        "DELETE FROM scan_roots WHERE REPLACE(root_path, '\\', '/') = ?1",
        params![normalized.clone()],
    )
    .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;

    Ok(RootCleanupResult {
        removed_root: normalized,
        deleted_assets,
        deleted_jobs,
    })
}

#[tauri::command]
pub fn v2_scan_cleanup_orphans(state: State<'_, AppState>) -> Result<RootCleanupResult, String> {
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let deleted_jobs = tx
        .execute(
            "DELETE FROM jobs
             WHERE json_valid(payload) = 1
               AND json_extract(payload, '$.assetId') IN (
                 SELECT id FROM assets a
                 WHERE NOT EXISTS (
                     SELECT 1 FROM scan_roots r
                     WHERE REPLACE(a.original_path, '\\', '/') = REPLACE(r.root_path, '\\', '/')
                        OR REPLACE(a.original_path, '\\', '/') LIKE REPLACE(r.root_path, '\\', '/') || '/%'
                   )
               )",
            [],
        )
        .map_err(|e| e.to_string())?;

    let deleted_assets = tx
        .execute(
            "DELETE FROM assets
             WHERE NOT EXISTS (
                 SELECT 1 FROM scan_roots
                 WHERE REPLACE(assets.original_path, '\\', '/') = REPLACE(scan_roots.root_path, '\\', '/')
                    OR REPLACE(assets.original_path, '\\', '/') LIKE REPLACE(scan_roots.root_path, '\\', '/') || '/%'
               )",
            [],
        )
        .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;

    Ok(RootCleanupResult {
        removed_root: "<orphans>".to_string(),
        deleted_assets,
        deleted_jobs,
    })
}

#[tauri::command]
pub fn v2_assets_query(
    state: State<'_, AppState>,
    input: AssetsQueryInput,
) -> Result<AssetsQueryResult, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let page_size = input.limit.unwrap_or(40).clamp(1, 200);
    let current_page = input.page.unwrap_or(1).max(1);
    let search_query = input
        .search
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned);
    let mut where_sql = "WHERE 1=1".to_string();
    let mut params_values: Vec<Box<dyn ToSql>> = Vec::new();

    if let Some(cursor) = input.cursor {
        where_sql.push_str(" AND id < ?");
        params_values.push(Box::new(cursor));
    }

    if let Some(asset_type) = input.asset_type.filter(|s| !s.is_empty() && s != "all") {
        where_sql.push_str(" AND type = ?");
        params_values.push(Box::new(asset_type));
    }

    if let Some(root_path) = input.root_path.filter(|s| !s.trim().is_empty()) {
        let normalized = root_path.replace('\\', "/");
        let normalized_like = format!("{}/%", normalized);
        where_sql.push_str(
            " AND (REPLACE(COALESCE(root_path, ''), '\\', '/') = ? OR REPLACE(original_path, '\\', '/') = ? OR REPLACE(original_path, '\\', '/') LIKE ?)",
        );
        params_values.push(Box::new(normalized.clone()));
        params_values.push(Box::new(normalized));
        params_values.push(Box::new(normalized_like));
    }

    if let Some(tags) = input.tags {
        for tag in tags {
            let normalized = tag.trim().to_lowercase();
            if normalized.is_empty() {
                continue;
            }
            where_sql.push_str(" AND EXISTS (SELECT 1 FROM asset_tags at JOIN tags t ON t.id = at.tag_id WHERE at.asset_id = assets.id AND t.name = ?)");
            params_values.push(Box::new(normalized));
        }
    }

    let sort_by = match input.sort_by.as_deref() {
        Some("filename") => "filename",
        Some("file_size") => "file_size",
        Some("mtime_ms") => "mtime_ms",
        _ => "id",
    };
    let sort_order = match input.sort_order.as_deref() {
        Some("asc") | Some("ASC") => "ASC",
        _ => "DESC",
    };

    let base_sql = format!(
        "SELECT assets.id, assets.filename, assets.extension, assets.original_path, assets.type, asset_previews.thumbnail_path, assets.file_size, assets.mtime_ms, assets.tags, assets.date_modified, asset_previews.waveform_data
         FROM assets
         LEFT JOIN asset_previews ON asset_previews.asset_id = assets.id
         {}",
        where_sql
    );

    let params_refs: Vec<&dyn ToSql> = params_values.iter().map(|v| v.as_ref()).collect();

    if let Some(search) = search_query {
        let Some(fts_query) = build_assets_fts_query(&search) else {
            return Ok(AssetsQueryResult {
                data: Vec::new(),
                next_cursor: None,
                total_items: 0,
                total_pages: 1,
                current_page: 1,
                page_size,
            });
        };

        let count_sql = format!(
            "WITH matched_assets AS (
                 SELECT rowid AS asset_id
                 FROM assets_fts
                 WHERE assets_fts MATCH ?1
             )
             SELECT COUNT(*)
             FROM matched_assets
             JOIN assets ON assets.id = matched_assets.asset_id
             {}",
            where_sql
        );
        let mut count_params_refs: Vec<&dyn ToSql> = Vec::with_capacity(params_refs.len() + 1);
        count_params_refs.push(&fts_query);
        count_params_refs.extend(params_refs.iter().copied());

        let total_items: u64 = conn
            .query_row(&count_sql, count_params_refs.as_slice(), |row| {
                row.get::<_, i64>(0).map(|value| value as u64)
            })
            .map_err(|e| e.to_string())?;

        let total_pages = if total_items == 0 {
            1
        } else {
            ((total_items as f64) / (page_size as f64)).ceil() as u32
        };
        let effective_page = current_page.min(total_pages);
        let page_offset = (effective_page.saturating_sub(1) * page_size) as i64;

        let sql = format!(
            "WITH matched_assets AS (
                 SELECT rowid AS asset_id, bm25(assets_fts) AS rank_score
                 FROM assets_fts
                 WHERE assets_fts MATCH ?1
             )
             SELECT assets.id, assets.filename, assets.extension, assets.original_path, assets.type,
                    asset_previews.thumbnail_path, assets.file_size, assets.mtime_ms, assets.tags,
                    assets.date_modified, asset_previews.waveform_data
             FROM matched_assets
             JOIN assets ON assets.id = matched_assets.asset_id
             LEFT JOIN asset_previews ON asset_previews.asset_id = assets.id
             {}
             ORDER BY matched_assets.rank_score ASC, assets.id DESC
             LIMIT {} OFFSET {}",
            where_sql, page_size, page_offset
        );

        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(count_params_refs.as_slice(), parse_asset_row)
            .map_err(|e| e.to_string())?;

        let mut data = Vec::new();
        for row in rows {
            data.push(row.map_err(|e| e.to_string())?);
        }

        let next_cursor = if effective_page < total_pages {
            data.last().map(|x| x.id)
        } else {
            None
        };

        return Ok(AssetsQueryResult {
            data,
            next_cursor,
            total_items,
            total_pages,
            current_page: effective_page,
            page_size,
        });
    }

    let count_sql = format!("SELECT COUNT(*) FROM assets {}", where_sql);
    let count_params_refs: Vec<&dyn ToSql> = params_values.iter().map(|v| v.as_ref()).collect();
    let total_items: u64 = conn
        .query_row(&count_sql, count_params_refs.as_slice(), |row| {
            row.get::<_, i64>(0).map(|value| value as u64)
        })
        .map_err(|e| e.to_string())?;

    let total_pages = if total_items == 0 {
        1
    } else {
        ((total_items as f64) / (page_size as f64)).ceil() as u32
    };

    let effective_page = current_page.min(total_pages);
    let page_offset = (effective_page.saturating_sub(1) * page_size) as i64;

    let sql = format!(
        "{}
         ORDER BY {} {} , id DESC
         LIMIT {} OFFSET {}",
        base_sql, sort_by, sort_order, page_size, page_offset
    );

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params_refs.as_slice(), parse_asset_row)
        .map_err(|e| e.to_string())?;

    let mut data = Vec::new();
    for row in rows {
        data.push(row.map_err(|e| e.to_string())?);
    }

    let next_cursor = if effective_page < total_pages {
        data.last().map(|x| x.id)
    } else {
        None
    };

    Ok(AssetsQueryResult {
        data,
        next_cursor,
        total_items,
        total_pages,
        current_page: effective_page,
        page_size,
    })
}

#[tauri::command]
pub fn v2_asset_prefetch(
    state: State<'_, AppState>,
    asset_ids: Vec<i64>,
) -> Result<String, String> {
    let mut count = 0usize;
    for asset_id in asset_ids {
        if enqueue_waveform_job_if_needed(&state, asset_id, 0)? {
            count += 1;
        }
        if enqueue_video_thumbnail_job_if_needed(&state, asset_id, 0)? {
            count += 1;
        }
    }
    Ok(format!("Enqueued {} prefetch jobs", count))
}

#[tauri::command]
pub async fn v2_jobs_list(
    state: State<'_, AppState>,
    limit: Option<u32>,
) -> Result<Vec<models::JobDto>, String> {
    list_jobs(&state, limit.unwrap_or(100).clamp(1, 500)).await
}

#[tauri::command]
pub async fn v2_jobs_cancel(state: State<'_, AppState>, job_id: i64) -> Result<String, String> {
    let cancelled = cancel_job(&state, job_id).await?;
    if cancelled {
        Ok(format!("Cancellation requested for job {}", job_id))
    } else {
        Ok(format!("No cancellable job found for id {}", job_id))
    }
}

#[tauri::command]
pub fn v2_jobs_subscribe() -> Result<Vec<String>, String> {
    Ok(vec![
        "v2-job-updated".to_string(),
        "v2-scan-progress".to_string(),
        "v2-waveform-ready".to_string(),
        "v2-thumbnail-ready".to_string(),
    ])
}

#[tauri::command]
pub fn v2_asset_mutation(
    state: State<'_, AppState>,
    input: MutationInput,
) -> Result<String, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    match input.action.as_str() {
        "rename" => {
            let asset_id = input.asset_id.ok_or("assetId is required")?;
            let new_name = input.new_name.ok_or("newName is required")?;

            let old_path: String = conn
                .query_row(
                    "SELECT original_path FROM assets WHERE id = ?1",
                    params![asset_id],
                    |row| row.get(0),
                )
                .map_err(|e| e.to_string())?;

            let old_path_buf = Path::new(&old_path);
            let parent = old_path_buf
                .parent()
                .ok_or("Cannot find parent directory")?;
            let new_path = parent.join(new_name);
            std::fs::rename(&old_path, &new_path).map_err(|e| e.to_string())?;

            let new_path_str = new_path.to_string_lossy().to_string();
            let filename = new_path
                .file_name()
                .and_then(|v| v.to_str())
                .unwrap_or_default()
                .to_string();
            let extension = new_path
                .extension()
                .and_then(|v| v.to_str())
                .unwrap_or_default()
                .to_lowercase();

            conn.execute(
                "UPDATE assets
                 SET filename = ?1,
                     extension = ?2,
                     original_path = ?3,
                     date_modified = CURRENT_TIMESTAMP
                 WHERE id = ?4",
                params![filename, extension, new_path_str, asset_id],
            )
            .map_err(|e| e.to_string())?;

            Ok("Asset renamed".to_string())
        }
        "delete" => {
            let asset_id = input.asset_id.ok_or("assetId is required")?;
            let path = if let Some(path) = input.path {
                path
            } else {
                conn.query_row(
                    "SELECT original_path FROM assets WHERE id = ?1",
                    params![asset_id],
                    |row| row.get(0),
                )
                .map_err(|e| e.to_string())?
            };

            let _ = std::fs::remove_file(path);
            conn.execute("DELETE FROM assets WHERE id = ?1", params![asset_id])
                .map_err(|e| e.to_string())?;
            Ok("Asset deleted".to_string())
        }
        "set_tags" => {
            let asset_id = input.asset_id.ok_or("assetId is required")?;
            let tags = input.tags.unwrap_or_default();
            let normalized = tags
                .iter()
                .map(|x| x.trim().to_lowercase())
                .filter(|x| !x.is_empty())
                .collect::<Vec<_>>();
            let csv = normalized.join(",");

            conn.execute(
                "UPDATE assets SET tags = ?1, date_modified = CURRENT_TIMESTAMP WHERE id = ?2",
                params![csv, asset_id],
            )
            .map_err(|e| e.to_string())?;

            conn.execute(
                "DELETE FROM asset_tags WHERE asset_id = ?1",
                params![asset_id],
            )
            .map_err(|e| e.to_string())?;

            for tag in normalized {
                conn.execute(
                    "INSERT INTO tags(name) VALUES (?1) ON CONFLICT(name) DO NOTHING",
                    params![tag],
                )
                .map_err(|e| e.to_string())?;
                let tag_id: i64 = conn
                    .query_row("SELECT id FROM tags WHERE name = ?1", params![tag], |row| {
                        row.get(0)
                    })
                    .map_err(|e| e.to_string())?;
                conn.execute(
                    "INSERT OR IGNORE INTO asset_tags(asset_id, tag_id) VALUES (?1, ?2)",
                    params![asset_id, tag_id],
                )
                .map_err(|e| e.to_string())?;
            }

            Ok("Tags updated".to_string())
        }
        _ => Err("Unsupported mutation action".to_string()),
    }
}

#[tauri::command]
pub async fn v2_media_trim(state: State<'_, AppState>, input: TrimInput) -> Result<String, String> {
    if input.start_sec < 0.0 || input.end_sec <= input.start_sec {
        return Err("Invalid trim range".to_string());
    }
    let payload = serde_json::to_string(&input).map_err(|e| e.to_string())?;
    let job_id = enqueue_job(&state, "trim_media", &payload, 2).await?;
    Ok(format!("Queued trim job {}", job_id))
}

#[tauri::command]
pub async fn v2_ytdlp_probe(app: AppHandle, url: String) -> Result<YtdlpProbeResult, String> {
    let trimmed = url.trim().to_string();
    if trimmed.is_empty() {
        return Err("URL is required".to_string());
    }

    tauri::async_runtime::spawn_blocking(move || {
        let yt_dlp_bin = resolve_yt_dlp_bin(&app)?;
        let output = hidden_command(&yt_dlp_bin)
            .args([
                "--skip-download",
                "--no-playlist",
                "--no-warnings",
                "--print",
                "%(id)s",
                "--print",
                "%(title)s",
                "--print",
                "%(uploader)s",
                "--print",
                "%(duration)s",
                "--print",
                "%(thumbnail)s",
                "--print",
                "%(webpage_url)s",
                trimmed.as_str(),
            ])
            .output()
            .map_err(|e| format!("Failed to execute yt-dlp: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(if stderr.is_empty() {
                "yt-dlp probe failed".to_string()
            } else {
                format!("yt-dlp probe failed: {}", stderr)
            });
        }

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let mut lines = stdout
            .lines()
            .map(str::trim)
            .filter(|line| !line.is_empty())
            .map(ToOwned::to_owned);

        let id = lines.next().filter(|value| !value.eq_ignore_ascii_case("NA"));
        let title = lines.next().filter(|value| !value.eq_ignore_ascii_case("NA"));
        let uploader = lines.next().filter(|value| !value.eq_ignore_ascii_case("NA"));
        let duration = lines
            .next()
            .filter(|value| !value.eq_ignore_ascii_case("NA"))
            .and_then(|value| value.parse::<f64>().ok());
        let thumbnail = lines
            .next()
            .filter(|value| !value.eq_ignore_ascii_case("NA") && !value.trim().is_empty());
        let webpage_url = lines
            .next()
            .filter(|value| !value.eq_ignore_ascii_case("NA") && !value.trim().is_empty());

        let thumbnails = thumbnail
            .as_ref()
            .map(|value| {
                vec![YtdlpThumbnailOption {
                    id: None,
                    url: value.clone(),
                    width: None,
                    height: None,
                    preference: None,
                }]
            })
            .unwrap_or_default();

        Ok(YtdlpProbeResult {
            id,
            title,
            uploader,
            duration,
            thumbnail,
            thumbnails,
            webpage_url,
            formats: Vec::new(),
        })
    })
    .await
    .map_err(|e| format!("Probe worker join failed: {}", e))?
}

#[tauri::command]
pub async fn v2_ytdlp_download(
    state: State<'_, AppState>,
    input: YtdlpDownloadInput,
) -> Result<String, String> {
    if input.url.trim().is_empty() {
        return Err("URL is required".to_string());
    }
    if input.output_dir.trim().is_empty() {
        return Err("Output directory is required".to_string());
    }

    let payload = serde_json::to_string(&input).map_err(|e| e.to_string())?;
    let job_id = enqueue_job(&state, "youtube_download", &payload, 2).await?;
    Ok(format!("Queued YouTube download job {}", job_id))
}

#[tauri::command]
pub fn v2_dependencies_status(app: AppHandle) -> Result<DependencyStatus, String> {
    let bin_dir = get_bin_dir(&app)?;

    let yt_name = if cfg!(target_os = "windows") {
        "yt-dlp.exe"
    } else {
        "yt-dlp"
    };
    let ffmpeg_name = if cfg!(target_os = "windows") {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    };
    let ffprobe_name = if cfg!(target_os = "windows") {
        "ffprobe.exe"
    } else {
        "ffprobe"
    };
    let deno_name = if cfg!(target_os = "windows") {
        "deno.exe"
    } else {
        "deno"
    };

    let yt_dlp_path = bin_dir.join(yt_name);
    let ffmpeg_path = bin_dir.join(ffmpeg_name);
    let ffprobe_path = bin_dir.join(ffprobe_name);
    let deno_path = bin_dir.join(deno_name);

    Ok(DependencyStatus {
        yt_dlp_installed: yt_dlp_path.exists(),
        ffmpeg_installed: ffmpeg_path.exists(),
        ffprobe_installed: ffprobe_path.exists(),
        deno_installed: deno_path.exists(),
        yt_dlp_path: yt_dlp_path
            .exists()
            .then(|| yt_dlp_path.to_string_lossy().to_string()),
        ffmpeg_path: ffmpeg_path
            .exists()
            .then(|| ffmpeg_path.to_string_lossy().to_string()),
        ffprobe_path: ffprobe_path
            .exists()
            .then(|| ffprobe_path.to_string_lossy().to_string()),
        deno_path: deno_path
            .exists()
            .then(|| deno_path.to_string_lossy().to_string()),
    })
}

#[tauri::command]
pub async fn v2_dependencies_install(state: State<'_, AppState>) -> Result<String, String> {
    let id = enqueue_job(&state, "dependencies_install", "{}", 1).await?;
    Ok(format!("Queued dependency install job {}", id))
}

#[tauri::command]
pub async fn v2_dependencies_update(state: State<'_, AppState>) -> Result<String, String> {
    let id = enqueue_job(&state, "dependencies_update", "{}", 1).await?;
    Ok(format!("Queued dependency update job {}", id))
}

pub(crate) fn process_ytdlp_download_job<F>(
    app: &AppHandle,
    payload: &str,
    mut on_progress: F,
) -> Result<(), String>
where
    F: FnMut(u8, &str),
{
    let parsed: YtdlpDownloadInput =
        serde_json::from_str(payload).map_err(|e| format!("Invalid download payload: {}", e))?;

    let url = parsed.url.trim();
    if url.is_empty() {
        return Err("Download URL is empty".to_string());
    }

    let output_dir = Path::new(parsed.output_dir.trim());
    if !output_dir.exists() {
        std::fs::create_dir_all(output_dir).map_err(|e| {
            format!(
                "Failed to create output directory {}: {}",
                output_dir.display(),
                e
            )
        })?;
    }

    let yt_dlp_bin = resolve_yt_dlp_bin(app)?;
    let output_template = parsed
        .filename_template
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .unwrap_or("%(title).200B [%(id)s].%(ext)s")
        .to_string();

    let mut args: Vec<String> = vec![
        "--newline".to_string(),
        "--no-warnings".to_string(),
        "--progress".to_string(),
        "--compat-options".to_string(),
        "no-live-chat".to_string(),
        "--output".to_string(),
        output_template,
        "--paths".to_string(),
        output_dir.to_string_lossy().to_string(),
    ];

    if parsed.no_playlist.unwrap_or(true) {
        args.push("--no-playlist".to_string());
    }

    if parsed.embed_thumbnail.unwrap_or(false) {
        args.push("--embed-thumbnail".to_string());
    }

    if parsed.embed_metadata.unwrap_or(false) {
        args.push("--embed-metadata".to_string());
    }

    if parsed.write_thumbnail.unwrap_or(false) {
        args.push("--write-thumbnail".to_string());
    }

    if parsed.write_all_thumbnails.unwrap_or(false) {
        args.push("--write-all-thumbnails".to_string());
    }

    if parsed.list_thumbnails.unwrap_or(false) {
        args.push("--list-thumbnails".to_string());

        if parsed.no_simulate.unwrap_or(false) {
            args.push("--no-simulate".to_string());
        }
    }

    if parsed.write_subtitles.unwrap_or(false) {
        args.push("--write-subs".to_string());
        args.push("--sub-langs".to_string());
        args.push("all,-live_chat".to_string());
    }

    let mode = parsed
        .mode
        .as_deref()
        .map(str::trim)
        .unwrap_or("video")
        .to_lowercase();
    let extract_audio = parsed.extract_audio.unwrap_or(mode == "audio");

    if extract_audio {
        args.push("--extract-audio".to_string());
        args.push("--audio-format".to_string());
        args.push(
            parsed
                .audio_format
                .as_deref()
                .map(str::trim)
                .filter(|v| !v.is_empty())
                .unwrap_or("mp3")
                .to_string(),
        );
        args.push("--audio-quality".to_string());
        args.push(
            parsed
                .audio_quality
                .as_deref()
                .map(str::trim)
                .filter(|v| !v.is_empty())
                .unwrap_or("0")
                .to_string(),
        );
        args.push("--format".to_string());
        args.push(
            parsed
                .format
                .as_deref()
                .map(str::trim)
                .filter(|v| !v.is_empty())
                .unwrap_or("bestaudio/best")
                .to_string(),
        );
    } else {
        args.push("--format".to_string());
        args.push(
            parsed
                .format
                .as_deref()
                .map(str::trim)
                .filter(|v| !v.is_empty())
                .unwrap_or("bestvideo*+bestaudio/best")
                .to_string(),
        );
        let ffmpeg_bin = resolve_ffmpeg_bin(app)?;
        args.push("--ffmpeg-location".to_string());
        args.push(ffmpeg_bin);
    }

    args.push(url.to_string());

    on_progress(4, "Preparing yt-dlp download");
    let mut child = hidden_command(&yt_dlp_bin)
        .args(&args)
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to run yt-dlp: {}", e))?;

    let mut last_message = String::new();
    if let Some(stderr) = child.stderr.take() {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            let text = line.unwrap_or_default();
            if text.trim().is_empty() {
                continue;
            }

            if let Some(percent) = parse_progress_percent(&text) {
                on_progress(percent, &text);
            } else {
                on_progress(8, &text);
            }
            last_message = text;
        }
    }

    let status = child.wait().map_err(|e| format!("yt-dlp wait failed: {}", e))?;
    if !status.success() {
        return Err(if last_message.trim().is_empty() {
            "yt-dlp download failed".to_string()
        } else {
            format!("yt-dlp download failed: {}", last_message)
        });
    }

    on_progress(100, "Download complete");
    Ok(())
}

pub(crate) fn process_generate_waveform_job<F>(
    app: &AppHandle,
    state: &AppState,
    payload: &str,
    mut on_progress: F,
) -> Result<(), String>
where
    F: FnMut(u8, &str),
{
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct WaveformPayload {
        asset_id: i64,
    }

    let parsed: WaveformPayload = serde_json::from_str(payload).map_err(|e| e.to_string())?;

    on_progress(12, "Preparing waveform source");

    let (original_path, asset_type, mtime_ms) = {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT original_path, type, mtime_ms FROM assets WHERE id = ?1",
            params![parsed.asset_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i64>(2)?,
                ))
            },
        )
        .map_err(|e| e.to_string())?
    };

    if asset_type != "audio" {
        return Ok(());
    }

    on_progress(48, "Generating waveform");
    let waveform = waveform::generate_waveform(&original_path, WAVEFORM_BARS)?;
    let waveform_json = serde_json::to_string(&waveform).map_err(|e| e.to_string())?;

    on_progress(86, "Saving waveform preview");
    {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO asset_previews(asset_id, waveform_data, waveform_bars, generator_version, waveform_mtime_ms, generated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, CURRENT_TIMESTAMP)
             ON CONFLICT(asset_id) DO UPDATE SET
               waveform_data = excluded.waveform_data,
               waveform_bars = excluded.waveform_bars,
               generator_version = excluded.generator_version,
               waveform_mtime_ms = excluded.waveform_mtime_ms,
               generated_at = CURRENT_TIMESTAMP",
            params![parsed.asset_id, waveform_json, WAVEFORM_BARS as i64, WAVEFORM_VERSION, mtime_ms],
        )
        .map_err(|e| e.to_string())?;
    }

    let _ = app.emit(
        "v2-waveform-ready",
        serde_json::json!({ "assetId": parsed.asset_id }),
    );

    on_progress(97, "Waveform ready");

    Ok(())
}

pub(crate) fn process_generate_video_thumbnail_job<F>(
    app: &AppHandle,
    state: &AppState,
    payload: &str,
    mut on_progress: F,
) -> Result<(), String>
where
    F: FnMut(u8, &str),
{
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct ThumbnailPayload {
        asset_id: i64,
    }

    let parsed: ThumbnailPayload = serde_json::from_str(payload).map_err(|e| e.to_string())?;

    on_progress(10, "Preparing thumbnail source");

    let (original_path, asset_type, extension, mtime_ms, previous_thumbnail_path) = {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT original_path, type, extension, mtime_ms,
                    (SELECT thumbnail_path FROM asset_previews WHERE asset_id = assets.id)
             FROM assets
             WHERE id = ?1",
            params![parsed.asset_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, Option<String>>(4)?,
                ))
            },
        )
        .map_err(|e| e.to_string())?
    };

    if !is_thumbnail_asset_type(&asset_type) {
        return Ok(());
    }

    let thumb_dir = get_thumbnail_dir(app)?;
    let thumb_path = thumb_dir.join(format!("{}_{}_thumb.jpg", parsed.asset_id, mtime_ms));
    let thumb_path_str = thumb_path.to_string_lossy().to_string();

    if asset_type == "video" {
        on_progress(32, "Resolving ffmpeg");

        let ffmpeg_bin = resolve_ffmpeg_bin(app)?;
        on_progress(58, "Rendering video thumbnail");
        let ffmpeg_output = hidden_command(&ffmpeg_bin)
            .args([
                "-y",
                "-ss",
                "00:00:01",
                "-i",
                &original_path,
                "-frames:v",
                "1",
                "-vf",
                "scale=480:-1",
                &thumb_path_str,
            ])
            .output()
            .map_err(|e| format!("Failed to run ffmpeg: {}", e))?;

        if !ffmpeg_output.status.success() {
            let stderr = String::from_utf8_lossy(&ffmpeg_output.stderr).to_string();
            return Err(format!("ffmpeg thumbnail failed: {}", stderr));
        }
    } else if asset_type == "image" {
        if should_skip_image_thumbnail(&extension) {
            return Ok(());
        }
        on_progress(32, "Decoding image");
        let source = image::open(&original_path)
            .map_err(|e| format!("Failed to decode image thumbnail source: {}", e))?;
        let (target_width, target_height) =
            thumbnail_dimensions(source.width(), source.height(), 160);
        on_progress(58, "Rendering image thumbnail");
        let resized = source.resize_exact(
            target_width,
            target_height,
            image::imageops::FilterType::Lanczos3,
        );
        resized
            .save_with_format(&thumb_path, image::ImageFormat::Jpeg)
            .map_err(|e| format!("Failed to save image thumbnail: {}", e))?;
    } else {
        return Ok(());
    }

    on_progress(88, "Saving thumbnail preview");
    {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO asset_previews(asset_id, thumbnail_path, thumbnail_mtime_ms, thumbnail_version, generated_at)
             VALUES (?1, ?2, ?3, ?4, CURRENT_TIMESTAMP)
             ON CONFLICT(asset_id) DO UPDATE SET
               thumbnail_path = excluded.thumbnail_path,
               thumbnail_mtime_ms = excluded.thumbnail_mtime_ms,
               thumbnail_version = excluded.thumbnail_version,
               generated_at = CURRENT_TIMESTAMP",
            params![parsed.asset_id, thumb_path_str, mtime_ms, THUMBNAIL_VERSION],
        )
        .map_err(|e| e.to_string())?;
    }

    if let Some(stale_thumbnail_path) =
        previous_thumbnail_to_remove(previous_thumbnail_path, &thumb_path_str)
    {
        let _ = std::fs::remove_file(stale_thumbnail_path);
    }

    let _ = app.emit(
        "v2-thumbnail-ready",
        serde_json::json!({ "assetId": parsed.asset_id }),
    );

    on_progress(97, "Thumbnail ready");

    Ok(())
}

pub(crate) fn process_trim_media_job<F>(
    app: &AppHandle,
    state: &AppState,
    payload: &str,
    mut on_progress: F,
) -> Result<(), String>
where
    F: FnMut(u8, &str),
{
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct TrimPayload {
        asset_id: i64,
        start_sec: f64,
        end_sec: f64,
    }

    let parsed: TrimPayload = serde_json::from_str(payload).map_err(|e| e.to_string())?;
    if parsed.asset_id <= 0 {
        return Err("assetId must be > 0".to_string());
    }
    if parsed.start_sec < 0.0 || parsed.end_sec <= parsed.start_sec {
        return Err("Invalid trim range".to_string());
    }

    on_progress(8, "Preparing trim source");
    let (source_path, source_type, source_root_path): (String, String, Option<String>) = {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT original_path, type, root_path FROM assets WHERE id = ?1",
            params![parsed.asset_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|e| e.to_string())?
    };

    if source_type != "audio" && source_type != "video" {
        return Err("Trim is currently supported for audio and video assets only".to_string());
    }

    let source_file = Path::new(&source_path);
    let source_parent = source_file
        .parent()
        .ok_or("Cannot resolve source parent folder")?;
    let source_stem = source_file
        .file_stem()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .ok_or("Cannot resolve source filename")?
        .to_string();
    let source_ext = source_file
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_lowercase();

    let start_ms = (parsed.start_sec * 1000.0).round().max(0.0) as i64;
    let end_ms = (parsed.end_sec * 1000.0).round().max(0.0) as i64;
    let base_trim_name = format!("{}_trim_{}_{}", source_stem, start_ms, end_ms);
    let trim_output = {
        let mut candidate_index = 0usize;
        loop {
            let suffix = if candidate_index == 0 {
                String::new()
            } else {
                format!("_{}", candidate_index)
            };
            let filename = if source_ext.is_empty() {
                format!("{}{}", base_trim_name, suffix)
            } else {
                format!("{}{}.{}", base_trim_name, suffix, source_ext)
            };
            let candidate = source_parent.join(filename);
            if !candidate.exists() {
                break candidate;
            }
            candidate_index += 1;
        }
    };
    let trim_output_path = trim_output.to_string_lossy().to_string();

    let ffmpeg_bin = resolve_ffmpeg_bin(app)?;
    let start_token = format!("{:.3}", parsed.start_sec.max(0.0));
    let end_token = format!("{:.3}", parsed.end_sec);

    on_progress(26, "Trimming media");
    let copy_output = hidden_command(&ffmpeg_bin)
        .args([
            "-y",
            "-ss",
            start_token.as_str(),
            "-to",
            end_token.as_str(),
            "-i",
            source_path.as_str(),
            "-map",
            "0",
            "-c",
            "copy",
            trim_output_path.as_str(),
        ])
        .output()
        .map_err(|e| format!("Failed to run ffmpeg trim: {}", e))?;

    if !copy_output.status.success() {
        on_progress(52, "Retrying trim with re-encode");
        let mut fallback_args = vec![
            "-y".to_string(),
            "-ss".to_string(),
            start_token.clone(),
            "-to".to_string(),
            end_token.clone(),
            "-i".to_string(),
            source_path.clone(),
        ];

        if source_type == "audio" {
            fallback_args.extend([
                "-vn".to_string(),
                "-c:a".to_string(),
                "aac".to_string(),
                "-b:a".to_string(),
                "192k".to_string(),
            ]);
        } else {
            fallback_args.extend([
                "-c:v".to_string(),
                "libx264".to_string(),
                "-preset".to_string(),
                "veryfast".to_string(),
                "-crf".to_string(),
                "18".to_string(),
                "-c:a".to_string(),
                "aac".to_string(),
                "-b:a".to_string(),
                "192k".to_string(),
            ]);
        }

        fallback_args.push(trim_output_path.clone());

        let fallback_output = hidden_command(&ffmpeg_bin)
            .args(fallback_args.iter().map(String::as_str))
            .output()
            .map_err(|e| format!("Failed to run ffmpeg fallback trim: {}", e))?;

        if !fallback_output.status.success() {
            let stderr = String::from_utf8_lossy(&fallback_output.stderr).trim().to_string();
            return Err(if stderr.is_empty() {
                "Trim failed".to_string()
            } else {
                format!("Trim failed: {}", stderr)
            });
        }
    }

    on_progress(72, "Saving trimmed asset");
    let trim_metadata =
        std::fs::metadata(&trim_output).map_err(|e| format!("Trim output missing: {}", e))?;
    let trim_file_size = trim_metadata.len() as i64;
    let trim_mtime_ms = trim_metadata
        .modified()
        .ok()
        .and_then(|ts| ts.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0);
    let trim_filename = trim_output
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_string();
    let trim_extension = trim_output
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_lowercase();
    let trim_root_path = source_root_path.unwrap_or_else(|| source_parent.to_string_lossy().to_string());

    let trimmed_asset_id: i64 = {
        let conn = state.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO assets(filename, extension, original_path, root_path, type, file_size, mtime_ms)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT(original_path) DO UPDATE SET
               filename = excluded.filename,
               extension = excluded.extension,
               root_path = excluded.root_path,
               type = excluded.type,
               file_size = excluded.file_size,
               mtime_ms = excluded.mtime_ms,
               date_modified = CURRENT_TIMESTAMP",
            params![
                trim_filename,
                trim_extension,
                trim_output_path,
                trim_root_path,
                source_type,
                trim_file_size,
                trim_mtime_ms
            ],
        )
        .map_err(|e| e.to_string())?;

        conn.query_row(
            "SELECT id FROM assets WHERE original_path = ?1",
            params![trim_output_path],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?
    };

    let _ = enqueue_waveform_job_if_needed(state, trimmed_asset_id, 1);
    let _ = enqueue_video_thumbnail_job_if_needed(state, trimmed_asset_id, 1);

    let _ = app.emit(
        "v2-trimmed-ready",
        serde_json::json!({
            "sourceAssetId": parsed.asset_id,
            "trimmedAssetId": trimmed_asset_id,
            "outputPath": trim_output_path,
        }),
    );

    on_progress(96, "Trim complete");
    Ok(())
}

pub(crate) fn process_dependencies_install_job<F>(
    app: &AppHandle,
    mut on_progress: F,
) -> Result<(), String>
where
    F: FnMut(&str),
{
    if !cfg!(target_os = "windows") {
        return Err("Dependency installer currently supports Windows only".to_string());
    }

    let bin_dir = get_bin_dir(app)?;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis();
    let temp_root = std::env::temp_dir().join(format!("editon-deps-{}", stamp));
    std::fs::create_dir_all(&temp_root).map_err(|e| e.to_string())?;

    let yt_file = temp_root.join("yt-dlp.exe");
    let ffmpeg_zip = temp_root.join("ffmpeg.zip");
    let ffmpeg_extract_dir = temp_root.join("ffmpeg");
    let deno_zip = temp_root.join("deno.zip");
    let deno_extract_dir = temp_root.join("deno");

    let install_result = (|| -> Result<(), String> {
        on_progress("10% Downloading yt-dlp.exe");
        download_file_with_retry(YT_DLP_WINDOWS_URL, &yt_file)?;
        on_progress("25% Downloading ffmpeg build archive");
        download_file_with_retry(FFMPEG_WINDOWS_URL, &ffmpeg_zip)?;
        on_progress("40% Downloading deno archive");
        download_file_with_retry(DENO_WINDOWS_URL, &deno_zip)?;

        std::fs::create_dir_all(&ffmpeg_extract_dir).map_err(|e| e.to_string())?;
        std::fs::create_dir_all(&deno_extract_dir).map_err(|e| e.to_string())?;
        on_progress("55% Extracting ffmpeg archive");
        expand_archive_with_retry(&ffmpeg_zip, &ffmpeg_extract_dir)?;
        on_progress("65% Extracting deno archive");
        expand_archive_with_retry(&deno_zip, &deno_extract_dir)?;

        let ffmpeg_src = find_file_recursive(&ffmpeg_extract_dir, "ffmpeg.exe")
            .ok_or("ffmpeg.exe not found after extraction")?;
        let ffprobe_src = find_file_recursive(&ffmpeg_extract_dir, "ffprobe.exe")
            .ok_or("ffprobe.exe not found after extraction")?;
        let deno_src = find_file_recursive(&deno_extract_dir, "deno.exe")
            .ok_or("deno.exe not found after extraction")?;

        on_progress("78% Installing yt-dlp binary");
        install_binary(&yt_file, &bin_dir.join("yt-dlp.exe"), "--version")?;
        on_progress("82% Installing ffmpeg binary");
        install_binary(&ffmpeg_src, &bin_dir.join("ffmpeg.exe"), "-version")?;
        on_progress("85% Installing ffprobe binary");
        install_binary(&ffprobe_src, &bin_dir.join("ffprobe.exe"), "-version")?;
        on_progress("88% Installing deno binary");
        install_binary(&deno_src, &bin_dir.join("deno.exe"), "--version")?;

        on_progress("90% Verifying installed binaries");
        verify_binary(&bin_dir.join("yt-dlp.exe"), "--version")?;
        verify_binary(&bin_dir.join("ffmpeg.exe"), "-version")?;
        verify_binary(&bin_dir.join("ffprobe.exe"), "-version")?;
        verify_binary(&bin_dir.join("deno.exe"), "--version")?;

        on_progress("100% Dependencies installed successfully");

        Ok(())
    })();

    let _ = std::fs::remove_dir_all(&temp_root);
    install_result
}

fn find_file_recursive(root: &Path, file_name: &str) -> Option<std::path::PathBuf> {
    for entry in WalkDir::new(root).into_iter().filter_map(Result::ok) {
        let path = entry.path();
        if path.is_file() {
            let name = path.file_name().and_then(|v| v.to_str());
            if name == Some(file_name) {
                return Some(path.to_path_buf());
            }
        }
    }
    None
}

fn ensure_file_non_empty(path: &Path, label: &str) -> Result<(), String> {
    let metadata = std::fs::metadata(path).map_err(|e| {
        format!(
            "Failed to access {} at {}: {}",
            label,
            path.display(),
            e
        )
    })?;

    if metadata.len() == 0 {
        return Err(format!("{} is empty at {}", label, path.display()));
    }

    Ok(())
}

fn retry_with_backoff<F>(attempts: usize, mut operation: F) -> Result<(), String>
where
    F: FnMut(usize) -> Result<(), String>,
{
    let mut last_error = String::new();

    for attempt in 1..=attempts {
        match operation(attempt) {
            Ok(()) => return Ok(()),
            Err(error) => {
                last_error = error;
                if attempt < attempts {
                    std::thread::sleep(Duration::from_millis(
                        DEPENDENCY_RETRY_BASE_DELAY_MS * attempt as u64,
                    ));
                }
            }
        }
    }

    Err(last_error)
}

fn copy_binary_file(source: &Path, destination: &Path) -> Result<(), String> {
    std::fs::copy(source, destination).map(|_| ()).map_err(|e| {
        format!(
            "Failed to copy {} to {}: {}",
            source.display(),
            destination.display(),
            e
        )
    })
}

fn temp_binary_path(destination: &Path, suffix: &str) -> Result<PathBuf, String> {
    let parent = destination
        .parent()
        .ok_or_else(|| format!("Cannot resolve destination parent for {}", destination.display()))?;
    let stem = destination
        .file_stem()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("dependency");
    let ext = destination.extension().and_then(|value| value.to_str());
    let file_name = match ext {
        Some(value) if !value.is_empty() => format!("{}.{}.{}", stem, suffix, value),
        _ => format!("{}.{}", stem, suffix),
    };
    Ok(parent.join(file_name))
}

fn replace_binary_with_retries(
    staged_path: &Path,
    destination: &Path,
    backup_path: &Path,
) -> Result<(), String> {
    retry_with_backoff(DEPENDENCY_REPLACE_ATTEMPTS, |attempt| {
        if backup_path.exists() {
            let _ = std::fs::remove_file(backup_path);
        }

        if destination.exists() {
            std::fs::rename(destination, backup_path).map_err(|e| {
                format!(
                    "Attempt {} failed to move existing binary {}: {}",
                    attempt,
                    destination.display(),
                    e
                )
            })?;
        }

        if let Err(error) = std::fs::rename(staged_path, destination) {
            if backup_path.exists() {
                let _ = std::fs::rename(backup_path, destination);
            }
            return Err(format!(
                "Attempt {} failed to place binary {}: {}",
                attempt,
                destination.display(),
                error
            ));
        }

        if backup_path.exists() {
            let _ = std::fs::remove_file(backup_path);
        }

        Ok(())
    })
}

fn install_binary(source: &Path, destination: &Path, version_arg: &str) -> Result<(), String> {
    let destination_parent = destination
        .parent()
        .ok_or_else(|| format!("Cannot resolve destination parent for {}", destination.display()))?;
    std::fs::create_dir_all(destination_parent).map_err(|e| e.to_string())?;

    ensure_file_non_empty(source, "dependency binary")?;

    let existing_healthy = destination.exists() && verify_binary(destination, version_arg).is_ok();
    let staged_path = temp_binary_path(destination, "incoming")?;
    let backup_path = temp_binary_path(destination, "backup")?;

    if staged_path.exists() {
        let _ = std::fs::remove_file(&staged_path);
    }
    if backup_path.exists() {
        let _ = std::fs::remove_file(&backup_path);
    }

    copy_binary_file(source, &staged_path)?;
    verify_binary(&staged_path, version_arg)?;

    match replace_binary_with_retries(&staged_path, destination, &backup_path) {
        Ok(()) => verify_binary(destination, version_arg),
        Err(error) => {
            let _ = std::fs::remove_file(&staged_path);
            let _ = std::fs::remove_file(&backup_path);
            if existing_healthy {
                Ok(())
            } else {
                Err(error)
            }
        }
    }
}

fn verify_binary(path: &Path, version_arg: &str) -> Result<(), String> {
    let output = hidden_command(path)
        .arg(version_arg)
        .output()
        .map_err(|e| format!("Failed to run {}: {}", path.display(), e))?;
    if output.status.success() {
        return Ok(());
    }
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    Err(format!(
        "Validation failed for {}: {}",
        path.display(),
        stderr
    ))
}

fn download_file_with_powershell(url: &str, destination: &Path) -> Result<(), String> {
    let script = format!(
        "$ProgressPreference='SilentlyContinue'; $ErrorActionPreference='Stop'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '{}' -OutFile '{}' -UseBasicParsing -TimeoutSec 300",
        ps_quote_single(url),
        ps_quote_single(&destination.to_string_lossy())
    );
    run_powershell_script(&script)
}

fn download_file_with_curl(url: &str, destination: &Path) -> Result<(), String> {
    let mut last_error = String::new();

    for command_name in ["curl.exe", "curl"] {
        let output = hidden_command(command_name)
            .args([
                "-fL",
                "--retry",
                "3",
                "--retry-delay",
                "2",
                "--connect-timeout",
                "20",
                "--max-time",
                "600",
                "-o",
                &destination.to_string_lossy(),
                url,
            ])
            .output();

        match output {
            Ok(result) if result.status.success() => return Ok(()),
            Ok(result) => {
                let stderr = String::from_utf8_lossy(&result.stderr);
                let stdout = String::from_utf8_lossy(&result.stdout);
                last_error = format!(
                    "{} failed. stdout: {} stderr: {}",
                    command_name,
                    stdout.trim(),
                    stderr.trim()
                );
            }
            Err(error) => {
                last_error = format!("{} unavailable: {}", command_name, error);
            }
        }
    }

    Err(format!("Curl download failed: {}", last_error))
}

fn download_file_with_retry(url: &str, destination: &Path) -> Result<(), String> {
    retry_with_backoff(DEPENDENCY_DOWNLOAD_ATTEMPTS, |attempt| {
        if destination.exists() {
            let _ = std::fs::remove_file(destination);
        }

        match download_file_with_powershell(url, destination) {
            Ok(()) => {}
            Err(powershell_error) => {
                download_file_with_curl(url, destination).map_err(|curl_error| {
                    format!(
                        "Attempt {} download failed. PowerShell: {}. Curl: {}",
                        attempt, powershell_error, curl_error
                    )
                })?;
            }
        }

        ensure_file_non_empty(destination, &format!("downloaded artifact from {}", url))
    })
}

fn expand_archive_with_powershell(zip_path: &Path, destination_dir: &Path) -> Result<(), String> {
    let script = format!(
        "Expand-Archive -LiteralPath '{}' -DestinationPath '{}' -Force",
        ps_quote_single(&zip_path.to_string_lossy()),
        ps_quote_single(&destination_dir.to_string_lossy())
    );
    run_powershell_script(&script)
}

fn expand_archive_with_tar(zip_path: &Path, destination_dir: &Path) -> Result<(), String> {
    let output = hidden_command("tar")
        .args([
            "-xf",
            &zip_path.to_string_lossy(),
            "-C",
            &destination_dir.to_string_lossy(),
        ])
        .output()
        .map_err(|e| format!("Failed to execute tar extraction: {}", e))?;

    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Err(format!(
        "Tar extraction failed. stdout: {} stderr: {}",
        stdout, stderr
    ))
}

fn expand_archive_with_retry(zip_path: &Path, destination_dir: &Path) -> Result<(), String> {
    retry_with_backoff(DEPENDENCY_EXTRACT_ATTEMPTS, |attempt| {
        if destination_dir.exists() {
            let _ = std::fs::remove_dir_all(destination_dir);
        }
        std::fs::create_dir_all(destination_dir).map_err(|e| {
            format!(
                "Attempt {} failed to prepare extraction directory {}: {}",
                attempt,
                destination_dir.display(),
                e
            )
        })?;

        match expand_archive_with_powershell(zip_path, destination_dir) {
            Ok(()) => Ok(()),
            Err(powershell_error) => {
                expand_archive_with_tar(zip_path, destination_dir).map_err(|tar_error| {
                    format!(
                        "Attempt {} extraction failed. PowerShell: {}. Tar: {}",
                        attempt, powershell_error, tar_error
                    )
                })
            }
        }
    })
}

fn run_powershell_script(script: &str) -> Result<(), String> {
    let mut last_error = String::new();
    for shell in ["powershell", "pwsh"] {
        let output = hidden_command(shell)
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                script,
            ])
            .output();

        match output {
            Ok(result) if result.status.success() => return Ok(()),
            Ok(result) => {
                let stderr = String::from_utf8_lossy(&result.stderr).to_string();
                let stdout = String::from_utf8_lossy(&result.stdout).to_string();
                last_error = format!(
                    "{} failed. stdout: {} stderr: {}",
                    shell,
                    stdout.trim(),
                    stderr.trim()
                );
            }
            Err(error) => {
                last_error = format!("{} unavailable: {}", shell, error);
            }
        }
    }

    Err(format!("PowerShell execution failed: {}", last_error))
}

fn ps_quote_single(value: &str) -> String {
    value.replace('\'', "''")
}

fn resolve_ffmpeg_bin(app: &AppHandle) -> Result<String, String> {
    let bin_dir = get_bin_dir(app)?;
    let ffmpeg_name = if cfg!(target_os = "windows") {
        "ffmpeg.exe"
    } else {
        "ffmpeg"
    };
    let candidate = bin_dir.join(ffmpeg_name);
    if candidate.exists() {
        return Ok(candidate.to_string_lossy().to_string());
    }

    Ok("ffmpeg".to_string())
}

fn resolve_yt_dlp_bin(app: &AppHandle) -> Result<String, String> {
    let bin_dir = get_bin_dir(app)?;
    let yt_name = if cfg!(target_os = "windows") {
        "yt-dlp.exe"
    } else {
        "yt-dlp"
    };
    let candidate = bin_dir.join(yt_name);
    if candidate.exists() {
        return Ok(candidate.to_string_lossy().to_string());
    }

    Ok("yt-dlp".to_string())
}

fn parse_progress_percent(line: &str) -> Option<u8> {
    let percent_index = line.find('%')?;
    let value_token = line[..percent_index].split_whitespace().last()?;
    let normalized = value_token
        .trim_matches(|c: char| !c.is_ascii_digit() && c != '.' && c != ',')
        .replace(',', ".");
    let value = normalized.parse::<f32>().ok()?;
    if !value.is_finite() {
        return None;
    }

    let bounded = value.clamp(0.0, 100.0).round() as u8;
    Some(bounded)
}

fn normalize_root_path(value: &str) -> String {
    let normalized = value.trim().replace('\\', "/");
    let trimmed = normalized.trim_end_matches('/');
    if trimmed.len() == 2 && trimmed.as_bytes()[1] == b':' {
        format!("{}/", trimmed)
    } else {
        trimmed.to_string()
    }
}

fn should_cancel_scan_for_removed_root(active_root_path: Option<&str>, removed_root_path: &str) -> bool {
    let Some(active_root) = active_root_path else {
        return false;
    };

    normalize_root_path(active_root) == normalize_root_path(removed_root_path)
}

fn enqueue_waveform_job_if_needed(
    state: &AppState,
    asset_id: i64,
    priority: i64,
) -> Result<bool, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let (asset_type, mtime_ms): (String, i64) = conn
        .query_row(
            "SELECT type, mtime_ms FROM assets WHERE id = ?1",
            params![asset_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| e.to_string())?;

    if asset_type != "audio" {
        return Ok(false);
    }

    let preview_fresh: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM asset_previews WHERE asset_id = ?1 AND waveform_mtime_ms = ?2 AND waveform_data IS NOT NULL",
            params![asset_id, mtime_ms],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if preview_fresh > 0 {
        return Ok(false);
    }

    let payload = serde_json::json!({ "assetId": asset_id }).to_string();
    let already_queued: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM jobs WHERE job_type = 'generate_waveform' AND payload = ?1 AND status IN ('queued', 'running')",
            params![payload.clone()],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    if already_queued > 0 {
        return Ok(false);
    }

    conn.execute(
        "INSERT INTO jobs(job_type, payload, status, priority) VALUES ('generate_waveform', ?1, 'queued', ?2)",
        params![payload, priority],
    )
    .map_err(|e| e.to_string())?;

    Ok(true)
}

fn enqueue_video_thumbnail_job_if_needed(
    state: &AppState,
    asset_id: i64,
    priority: i64,
) -> Result<bool, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let (asset_type, extension, mtime_ms): (String, String, i64) = conn
        .query_row(
            "SELECT type, extension, mtime_ms FROM assets WHERE id = ?1",
            params![asset_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|e| e.to_string())?;

    let preview_exists: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM asset_previews WHERE asset_id = ?1 AND thumbnail_path IS NOT NULL AND thumbnail_path != ''",
            params![asset_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let preview_fresh: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM asset_previews WHERE asset_id = ?1 AND thumbnail_mtime_ms = ?2 AND thumbnail_path IS NOT NULL AND thumbnail_path != ''",
            params![asset_id, mtime_ms],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if !should_enqueue_thumbnail_for_asset(
        &asset_type,
        &extension,
        preview_exists == 0,
        preview_fresh > 0,
    ) {
        return Ok(false);
    }

    let payload = serde_json::json!({ "assetId": asset_id }).to_string();
    let already_queued: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM jobs WHERE job_type = 'generate_video_thumbnail' AND payload = ?1 AND status IN ('queued', 'running')",
            params![payload.clone()],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    if already_queued > 0 {
        return Ok(false);
    }

    conn.execute(
        "INSERT INTO jobs(job_type, payload, status, priority) VALUES ('generate_video_thumbnail', ?1, 'queued', ?2)",
        params![payload, priority],
    )
    .map_err(|e| e.to_string())?;

    Ok(true)
}

#[cfg(test)]
mod tests {
    #[test]
    fn scan_enqueue_capture_includes_image_audio_and_video() {
        assert!(super::should_capture_scanned_asset_for_job_enqueue("image"));
        assert!(super::should_capture_scanned_asset_for_job_enqueue("audio"));
        assert!(super::should_capture_scanned_asset_for_job_enqueue("video"));
    }

    #[test]
    fn scan_enqueue_capture_excludes_unknown_asset_types() {
        assert!(!super::should_capture_scanned_asset_for_job_enqueue("unknown"));
    }

    #[test]
    fn thumbnail_policy_allows_image_and_video_only() {
        assert!(super::is_thumbnail_asset_type("image"));
        assert!(super::is_thumbnail_asset_type("video"));
        assert!(!super::is_thumbnail_asset_type("audio"));
        assert!(!super::is_thumbnail_asset_type("unknown"));
    }

    #[test]
    fn should_enqueue_thumbnail_returns_false_for_audio() {
        assert!(!super::should_enqueue_thumbnail("audio", true, false));
    }

    #[test]
    fn should_enqueue_thumbnail_returns_true_for_missing_image_thumbnail() {
        assert!(super::should_enqueue_thumbnail("image", true, false));
    }

    #[test]
    fn should_enqueue_thumbnail_returns_true_for_stale_image_thumbnail() {
        assert!(super::should_enqueue_thumbnail("image", false, false));
    }

    #[test]
    fn should_enqueue_thumbnail_returns_false_for_fresh_present_image_thumbnail() {
        assert!(!super::should_enqueue_thumbnail("image", false, true));
    }

    #[test]
    fn thumbnail_enqueue_policy_skips_svg_images() {
        assert!(!super::should_enqueue_thumbnail_for_asset(
            "image", "svg", true, false
        ));
        assert!(super::should_enqueue_thumbnail_for_asset(
            "image", "png", true, false
        ));
    }

    #[test]
    fn thumbnail_dimensions_scales_down_landscape() {
        assert_eq!(super::thumbnail_dimensions(4000, 2000, 160), (160, 80));
    }

    #[test]
    fn thumbnail_dimensions_scales_down_portrait() {
        assert_eq!(super::thumbnail_dimensions(800, 1600, 160), (80, 160));
    }

    #[test]
    fn thumbnail_dimensions_keeps_smaller_images_size() {
        assert_eq!(super::thumbnail_dimensions(120, 100, 160), (120, 100));
    }

    #[test]
    fn should_skip_image_thumbnail_for_svg_only() {
        assert!(super::should_skip_image_thumbnail("svg"));
        assert!(super::should_skip_image_thumbnail("SVG"));
        assert!(!super::should_skip_image_thumbnail("gif"));
        assert!(!super::should_skip_image_thumbnail("png"));
    }

    #[test]
    fn previous_thumbnail_to_remove_only_returns_different_non_empty_path() {
        assert_eq!(
            super::previous_thumbnail_to_remove(Some("old.jpg".to_string()), "new.jpg"),
            Some("old.jpg".to_string())
        );
        assert_eq!(
            super::previous_thumbnail_to_remove(Some("same.jpg".to_string()), "same.jpg"),
            None
        );
        assert_eq!(
            super::previous_thumbnail_to_remove(Some("   ".to_string()), "new.jpg"),
            None
        );
        assert_eq!(super::previous_thumbnail_to_remove(None, "new.jpg"), None);
    }

    #[test]
    fn should_cancel_scan_when_removed_root_matches_active_root() {
        assert!(super::should_cancel_scan_for_removed_root(
            Some("C:/Media"),
            "C:/Media"
        ));
    }

    #[test]
    fn should_not_cancel_scan_when_removed_root_is_different() {
        assert!(!super::should_cancel_scan_for_removed_root(
            Some("C:/Media"),
            "C:/Other"
        ));
    }
}
