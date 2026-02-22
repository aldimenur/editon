mod db;
mod jobs;
mod models;
mod state;
mod waveform;

use crate::v2::db::{classify_media_type, get_bin_dir, get_thumbnail_dir, init_database};
use crate::v2::jobs::{enqueue_job, list_jobs, start_worker};
use crate::v2::models::{
    AssetDto, AssetsQueryInput, AssetsQueryResult, DependencyStatus, MutationInput,
    RootCleanupResult, ScanProgress, ScanRootDto, TrimInput,
};
use crate::v2::state::AppState;
use rusqlite::{params, ToSql};
use std::path::Path;
use std::process::Command;
use std::sync::{atomic::Ordering, Arc, Mutex};
use tauri::{AppHandle, Emitter, State};
use walkdir::WalkDir;

const WAVEFORM_VERSION: &str = "v2.1";
const WAVEFORM_BARS: usize = 192;
const THUMBNAIL_VERSION: &str = "v2.1";
const YT_DLP_WINDOWS_URL: &str =
    "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe";
const FFMPEG_WINDOWS_URL: &str = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-lgpl.zip";
const DENO_WINDOWS_URL: &str =
    "https://github.com/denoland/deno/releases/latest/download/deno-x86_64-pc-windows-msvc.zip";

pub fn setup(app: AppHandle) -> Result<AppState, String> {
    let conn = init_database(&app)?;
    let state = AppState {
        conn: Arc::new(Mutex::new(conn)),
        cancel_scan: Arc::new(std::sync::atomic::AtomicBool::new(false)),
        worker_shutdown: Arc::new(std::sync::atomic::AtomicBool::new(false)),
        active_scan_id: Arc::new(Mutex::new(None)),
    };

    start_worker(
        app,
        AppState {
            conn: state.conn.clone(),
            cancel_scan: state.cancel_scan.clone(),
            worker_shutdown: state.worker_shutdown.clone(),
            active_scan_id: state.active_scan_id.clone(),
        },
    );

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
        *active = Some(scan_id.clone());
    }

    let db = state.conn.clone();
    let cancel = state.cancel_scan.clone();
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
        let mut count = 0usize;
        for entry in WalkDir::new(&normalized_root_path)
            .into_iter()
            .filter_map(Result::ok)
        {
            if cancel.load(Ordering::SeqCst) {
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

            let ext = match file_path.extension().and_then(|x| x.to_str()) {
                Some(value) => value,
                None => continue,
            };

            let media_type = match classify_media_type(ext) {
                Some(value) => value,
                None => continue,
            };

            let filename = file_path
                .file_name()
                .and_then(|x| x.to_str())
                .unwrap_or_default()
                .to_string();
            let original_path = file_path.to_string_lossy().to_string();
            let file_size = entry.metadata().map(|m| m.len() as i64).unwrap_or(0);
            let mtime_ms = entry
                .metadata()
                .ok()
                .and_then(|m| m.modified().ok())
                .and_then(|ts| ts.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as i64)
                .unwrap_or(0);

            if let Ok(conn) = db.lock() {
                let _ = conn.execute(
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
                        filename.clone(),
                        ext.to_lowercase(),
                        original_path.clone(),
                        root_path_for_db.clone(),
                        media_type,
                        file_size,
                        mtime_ms
                    ],
                );

                if media_type == "audio" || media_type == "video" {
                    let asset_id: Result<i64, _> = conn.query_row(
                        "SELECT id FROM assets WHERE original_path = ?1",
                        params![original_path],
                        |row| row.get(0),
                    );

                    if let Ok(asset_id) = asset_id {
                        if media_type == "audio" {
                            let payload = serde_json::json!({ "assetId": asset_id }).to_string();
                            let queued: i64 = conn
                                .query_row(
                                    "SELECT COUNT(*) FROM jobs WHERE job_type = 'generate_waveform' AND payload = ?1 AND status IN ('queued', 'running')",
                                    params![payload.clone()],
                                    |row| row.get(0),
                                )
                                .unwrap_or(0);

                            if queued == 0 {
                                let _ = conn.execute(
                                    "INSERT INTO jobs(job_type, payload, status, priority) VALUES ('generate_waveform', ?1, 'queued', 1)",
                                    params![payload],
                                );
                            }
                        }

                        if media_type == "video" {
                            let payload = serde_json::json!({ "assetId": asset_id }).to_string();
                            let queued: i64 = conn
                                .query_row(
                                    "SELECT COUNT(*) FROM jobs WHERE job_type = 'generate_video_thumbnail' AND payload = ?1 AND status IN ('queued', 'running')",
                                    params![payload.clone()],
                                    |row| row.get(0),
                                )
                                .unwrap_or(0);

                            if queued == 0 {
                                let _ = conn.execute(
                                    "INSERT INTO jobs(job_type, payload, status, priority) VALUES ('generate_video_thumbnail', ?1, 'queued', 1)",
                                    params![payload],
                                );
                            }
                        }
                    }
                }
            }

            count += 1;
            if count % 30 == 0 {
                let _ = emit_app.emit(
                    "v2-scan-progress",
                    ScanProgress {
                        scan_id: emit_scan_id.clone(),
                        count,
                        last_file: filename,
                        status: "processing".to_string(),
                    },
                );
            }
        }

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

    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let preview_paths = collect_preview_paths_for_root(&tx, &normalized, &normalized_like)?;

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
    cleanup_preview_files(&preview_paths);

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
    let preview_paths = collect_preview_paths_for_orphans(&tx)?;

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
    cleanup_preview_files(&preview_paths);

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

    if let Some(search) = input.search.filter(|s| !s.trim().is_empty()) {
        where_sql.push_str(" AND id IN (SELECT rowid FROM assets_fts WHERE assets_fts MATCH ?)");
        let query = search
            .split_whitespace()
            .map(|token| format!("{}*", token.replace('"', "")))
            .collect::<Vec<_>>()
            .join(" AND ");
        params_values.push(Box::new(query));
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
        "SELECT assets.id, assets.filename, assets.extension, assets.original_path, assets.type, asset_previews.thumbnail_path, assets.file_size, assets.mtime_ms, assets.tags, assets.date_modified, asset_previews.waveform_data
         FROM assets
         LEFT JOIN asset_previews ON asset_previews.asset_id = assets.id
         {}
         ORDER BY {} {} , id DESC
         LIMIT {} OFFSET {}",
        where_sql, sort_by, sort_order, page_size, page_offset
    );

    let params_refs: Vec<&dyn ToSql> = params_values.iter().map(|v| v.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params_refs.as_slice(), |row| {
            let thumbnail_path: Option<String> = row.get(5)?;
            let tags_csv: Option<String> = row.get(8)?;
            let waveform_json: Option<String> = row.get(10)?;
            let tags = tags_csv
                .unwrap_or_default()
                .split(',')
                .filter_map(|t| {
                    let v = t.trim();
                    if v.is_empty() {
                        None
                    } else {
                        Some(v.to_string())
                    }
                })
                .collect::<Vec<_>>();

            let waveform_data = match waveform_json {
                Some(value) if !value.trim().is_empty() => {
                    serde_json::from_str::<Vec<f32>>(&value).ok()
                }
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
        })
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
pub fn v2_jobs_list(
    state: State<'_, AppState>,
    limit: Option<u32>,
) -> Result<Vec<models::JobDto>, String> {
    list_jobs(&state, limit.unwrap_or(100).clamp(1, 500))
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
pub fn v2_media_trim(state: State<'_, AppState>, input: TrimInput) -> Result<String, String> {
    if input.start_sec < 0.0 || input.end_sec <= input.start_sec {
        return Err("Invalid trim range".to_string());
    }
    let payload = serde_json::to_string(&input).map_err(|e| e.to_string())?;
    let job_id = enqueue_job(&state, "trim_media", &payload, 2)?;
    Ok(format!("Queued trim job {}", job_id))
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
pub fn v2_dependencies_install(state: State<'_, AppState>) -> Result<String, String> {
    let id = enqueue_job(&state, "dependencies_install", "{}", 1)?;
    Ok(format!("Queued dependency install job {}", id))
}

#[tauri::command]
pub fn v2_dependencies_update(state: State<'_, AppState>) -> Result<String, String> {
    let id = enqueue_job(&state, "dependencies_update", "{}", 1)?;
    Ok(format!("Queued dependency update job {}", id))
}

pub(crate) fn process_generate_waveform_job(
    app: &AppHandle,
    state: &AppState,
    payload: &str,
) -> Result<(), String> {
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct WaveformPayload {
        asset_id: i64,
    }

    let parsed: WaveformPayload = serde_json::from_str(payload).map_err(|e| e.to_string())?;

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

    let waveform = waveform::generate_waveform(&original_path, WAVEFORM_BARS)?;
    let waveform_json = serde_json::to_string(&waveform).map_err(|e| e.to_string())?;

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

    Ok(())
}

pub(crate) fn process_generate_video_thumbnail_job(
    app: &AppHandle,
    state: &AppState,
    payload: &str,
) -> Result<(), String> {
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct ThumbnailPayload {
        asset_id: i64,
    }

    let parsed: ThumbnailPayload = serde_json::from_str(payload).map_err(|e| e.to_string())?;

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

    if asset_type != "video" {
        return Ok(());
    }

    let thumb_dir = get_thumbnail_dir(app)?;
    let thumb_path = thumb_dir.join(format!("{}_thumb.jpg", parsed.asset_id));
    let thumb_path_str = thumb_path.to_string_lossy().to_string();

    let ffmpeg_bin = resolve_ffmpeg_bin(app)?;
    let ffmpeg_output = Command::new(&ffmpeg_bin)
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

    let _ = app.emit(
        "v2-thumbnail-ready",
        serde_json::json!({ "assetId": parsed.asset_id }),
    );

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
        download_file_with_powershell(YT_DLP_WINDOWS_URL, &yt_file)?;
        on_progress("25% Downloading ffmpeg build archive");
        download_file_with_powershell(FFMPEG_WINDOWS_URL, &ffmpeg_zip)?;
        on_progress("40% Downloading deno archive");
        download_file_with_powershell(DENO_WINDOWS_URL, &deno_zip)?;

        std::fs::create_dir_all(&ffmpeg_extract_dir).map_err(|e| e.to_string())?;
        std::fs::create_dir_all(&deno_extract_dir).map_err(|e| e.to_string())?;
        on_progress("55% Extracting ffmpeg archive");
        expand_archive_with_powershell(&ffmpeg_zip, &ffmpeg_extract_dir)?;
        on_progress("65% Extracting deno archive");
        expand_archive_with_powershell(&deno_zip, &deno_extract_dir)?;

        let ffmpeg_src = find_file_recursive(&ffmpeg_extract_dir, "ffmpeg.exe")
            .ok_or("ffmpeg.exe not found after extraction")?;
        let ffprobe_src = find_file_recursive(&ffmpeg_extract_dir, "ffprobe.exe")
            .ok_or("ffprobe.exe not found after extraction")?;
        let deno_src = find_file_recursive(&deno_extract_dir, "deno.exe")
            .ok_or("deno.exe not found after extraction")?;

        on_progress("78% Copying binaries to app bin folder");
        copy_binary(&yt_file, &bin_dir.join("yt-dlp.exe"))?;
        copy_binary(&ffmpeg_src, &bin_dir.join("ffmpeg.exe"))?;
        copy_binary(&ffprobe_src, &bin_dir.join("ffprobe.exe"))?;
        copy_binary(&deno_src, &bin_dir.join("deno.exe"))?;

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

fn copy_binary(source: &Path, destination: &Path) -> Result<(), String> {
    if destination.exists() {
        std::fs::remove_file(destination).map_err(|e| e.to_string())?;
    }
    std::fs::copy(source, destination).map(|_| ()).map_err(|e| {
        format!(
            "Failed to copy {} to {}: {}",
            source.display(),
            destination.display(),
            e
        )
    })
}

fn verify_binary(path: &Path, version_arg: &str) -> Result<(), String> {
    let output = Command::new(path)
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
        "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -Uri '{}' -OutFile '{}'",
        ps_quote_single(url),
        ps_quote_single(&destination.to_string_lossy())
    );
    run_powershell_script(&script)
}

fn expand_archive_with_powershell(zip_path: &Path, destination_dir: &Path) -> Result<(), String> {
    let script = format!(
        "Expand-Archive -LiteralPath '{}' -DestinationPath '{}' -Force",
        ps_quote_single(&zip_path.to_string_lossy()),
        ps_quote_single(&destination_dir.to_string_lossy())
    );
    run_powershell_script(&script)
}

fn run_powershell_script(script: &str) -> Result<(), String> {
    let mut last_error = String::new();
    for shell in ["powershell", "pwsh"] {
        let output = Command::new(shell)
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

fn normalize_root_path(value: &str) -> String {
    let normalized = value.trim().replace('\\', "/");
    let trimmed = normalized.trim_end_matches('/');
    if trimmed.len() == 2 && trimmed.as_bytes()[1] == b':' {
        format!("{}/", trimmed)
    } else {
        trimmed.to_string()
    }
}

fn collect_preview_paths_for_root(
    tx: &rusqlite::Transaction<'_>,
    normalized: &str,
    normalized_like: &str,
) -> Result<Vec<String>, String> {
    let mut stmt = tx
        .prepare(
            "SELECT asset_previews.thumbnail_path, asset_previews.waveform_path
             FROM asset_previews
             JOIN assets ON assets.id = asset_previews.asset_id
             WHERE REPLACE(COALESCE(assets.root_path, ''), '\\', '/') = ?1
                OR REPLACE(assets.original_path, '\\', '/') = ?1
                OR REPLACE(assets.original_path, '\\', '/') LIKE ?2",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![normalized, normalized_like], |row| {
            Ok((
                row.get::<_, Option<String>>(0)?,
                row.get::<_, Option<String>>(1)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut paths = Vec::new();
    for row in rows {
        let (thumbnail_path, waveform_path) = row.map_err(|e| e.to_string())?;
        if let Some(path) = thumbnail_path.filter(|v| !v.trim().is_empty()) {
            paths.push(path);
        }
        if let Some(path) = waveform_path.filter(|v| !v.trim().is_empty()) {
            paths.push(path);
        }
    }

    Ok(paths)
}

fn collect_preview_paths_for_orphans(
    tx: &rusqlite::Transaction<'_>,
) -> Result<Vec<String>, String> {
    let mut stmt = tx
        .prepare(
            "SELECT asset_previews.thumbnail_path, asset_previews.waveform_path
             FROM asset_previews
             JOIN assets ON assets.id = asset_previews.asset_id
             WHERE NOT EXISTS (
                 SELECT 1 FROM scan_roots
                 WHERE REPLACE(assets.original_path, '\\', '/') = REPLACE(scan_roots.root_path, '\\', '/')
                    OR REPLACE(assets.original_path, '\\', '/') LIKE REPLACE(scan_roots.root_path, '\\', '/') || '/%'
               )",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, Option<String>>(0)?,
                row.get::<_, Option<String>>(1)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut paths = Vec::new();
    for row in rows {
        let (thumbnail_path, waveform_path) = row.map_err(|e| e.to_string())?;
        if let Some(path) = thumbnail_path.filter(|v| !v.trim().is_empty()) {
            paths.push(path);
        }
        if let Some(path) = waveform_path.filter(|v| !v.trim().is_empty()) {
            paths.push(path);
        }
    }

    Ok(paths)
}

fn cleanup_preview_files(paths: &[String]) {
    for path in paths {
        let _ = std::fs::remove_file(path);
    }
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

    let (asset_type, mtime_ms): (String, i64) = conn
        .query_row(
            "SELECT type, mtime_ms FROM assets WHERE id = ?1",
            params![asset_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| e.to_string())?;

    if asset_type != "video" {
        return Ok(false);
    }

    let preview_fresh: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM asset_previews WHERE asset_id = ?1 AND thumbnail_mtime_ms = ?2 AND thumbnail_path IS NOT NULL AND thumbnail_path != ''",
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
