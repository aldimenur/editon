use crate::v2::jobs::retry::backoff_seconds;
use crate::v2::jobs::types::JobRow;
use crate::v2::models::JobEvent;
use crate::v2::state::AppState;
use crate::v2::{
    process_dependencies_install_job, process_generate_video_thumbnail_job,
    process_generate_waveform_job, process_trim_media_job, process_ytdlp_download_job,
};
use sqlx::Row;
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

const STALE_RUNNING_SWEEP_INTERVAL: Duration = Duration::from_secs(30);

pub async fn run_worker(app: AppHandle, state: AppState) {
    let app_started_at = sqlx::query_scalar::<_, String>("SELECT CURRENT_TIMESTAMP")
        .fetch_optional(&state.db_pool)
        .await
        .ok()
        .flatten();
    let mut last_stale_sweep = Instant::now() - STALE_RUNNING_SWEEP_INTERVAL;

    loop {
        if state.worker_shutdown.load(std::sync::atomic::Ordering::SeqCst) {
            break;
        }

        if let Some(started_at) = app_started_at.as_deref() {
            if last_stale_sweep.elapsed() >= STALE_RUNNING_SWEEP_INTERVAL {
                if let Err(error) = recover_stale_running_jobs(&app, &state, started_at).await {
                    emit_job_event(
                        &app,
                        0,
                        "worker".to_string(),
                        "error".to_string(),
                        error,
                        None,
                    );
                }
                last_stale_sweep = Instant::now();
            }
        }

        match claim_next_job(&state).await {
            Ok(Some(job)) => {
                process_job(&app, &state, job).await;
            }
            Ok(None) => {
                thread::sleep(Duration::from_millis(250));
            }
            Err(error) => {
                emit_job_event(
                    &app,
                    0,
                    "worker".to_string(),
                    "error".to_string(),
                    error,
                    None,
                );
                thread::sleep(Duration::from_millis(500));
            }
        }
    }
}

async fn recover_stale_running_jobs(
    app: &AppHandle,
    state: &AppState,
    app_started_at: &str,
) -> Result<(), String> {
    let rows = sqlx::query(
        "SELECT id, job_type
         FROM jobs
         WHERE status = 'running'
           AND COALESCE(started_at, created_at, updated_at) < ?1
         ORDER BY id ASC",
    )
    .bind(app_started_at)
    .fetch_all(&state.db_pool)
    .await
    .map_err(|e| e.to_string())?;

    for row in rows {
        let job_id: i64 = row.try_get("id").map_err(|e| e.to_string())?;
        let job_type: String = row.try_get("job_type").map_err(|e| e.to_string())?;

        let affected = sqlx::query(
            "UPDATE jobs
             SET status = 'done',
                 finished_at = COALESCE(finished_at, CURRENT_TIMESTAMP),
                 updated_at = CURRENT_TIMESTAMP,
                 last_error = CASE
                     WHEN last_error IS NULL OR TRIM(last_error) = ''
                         THEN 'Recovered stale running job after app restart'
                     ELSE last_error
                 END
             WHERE id = ?1
               AND status = 'running'",
        )
        .bind(job_id)
        .execute(&state.db_pool)
        .await
        .map_err(|e| e.to_string())?
        .rows_affected();

        if affected > 0 {
            emit_job_event(
                app,
                job_id,
                job_type,
                "done".to_string(),
                "Recovered stale running job after app restart".to_string(),
                Some(100),
            );
        }
    }

    Ok(())
}

async fn claim_next_job(state: &AppState) -> Result<Option<JobRow>, String> {
    let mut tx = state.db_pool.begin().await.map_err(|e| e.to_string())?;

    let maybe_row = sqlx::query(
        "SELECT id, job_type, payload, attempts, max_attempts
         FROM jobs
         WHERE status = 'queued'
           AND cancellation_requested = 0
           AND (run_after IS NULL OR run_after <= CURRENT_TIMESTAMP)
         ORDER BY priority ASC, id ASC
         LIMIT 1",
    )
    .fetch_optional(&mut *tx)
    .await
    .map_err(|e| e.to_string())?;

    let Some(row) = maybe_row else {
        tx.commit().await.map_err(|e| e.to_string())?;
        return Ok(None);
    };

    let job = JobRow {
        id: row.try_get("id").map_err(|e| e.to_string())?,
        job_type: row.try_get("job_type").map_err(|e| e.to_string())?,
        payload: row.try_get("payload").map_err(|e| e.to_string())?,
        attempts: row.try_get("attempts").map_err(|e| e.to_string())?,
        max_attempts: row.try_get("max_attempts").map_err(|e| e.to_string())?,
    };

    let updated = sqlx::query(
        "UPDATE jobs
         SET status = 'running',
             attempts = attempts + 1,
             started_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?1 AND status = 'queued'",
    )
    .bind(job.id)
    .execute(&mut *tx)
    .await
    .map_err(|e| e.to_string())?
    .rows_affected();

    tx.commit().await.map_err(|e| e.to_string())?;
    if updated == 0 {
        return Ok(None);
    }

    Ok(Some(job))
}

async fn process_job(app: &AppHandle, state: &AppState, job: JobRow) {
    emit_job_event(
        app,
        job.id,
        job.job_type.clone(),
        "running".to_string(),
        format!("Running {}", job.job_type),
        Some(0),
    );

    let app_for_task = app.clone();
    let state_for_task = state.clone();
    let payload = job.payload.clone();
    let job_type = job.job_type.clone();
    let job_id = job.id;

    let result = tauri::async_runtime::spawn_blocking(move || match job_type.as_str() {
        "prefetch_preview" => Ok(()),
        "generate_waveform" => {
            let progress_app = app_for_task.clone();
            let progress_job_type = job_type.clone();
            process_generate_waveform_job(&app_for_task, &state_for_task, &payload, move |progress, phase| {
                emit_job_event(
                    &progress_app,
                    job_id,
                    progress_job_type.clone(),
                    "running".to_string(),
                    phase.to_string(),
                    Some(progress),
                );
            })
        }
        "generate_video_thumbnail" => {
            let progress_app = app_for_task.clone();
            let progress_job_type = job_type.clone();
            process_generate_video_thumbnail_job(
                &app_for_task,
                &state_for_task,
                &payload,
                move |progress, phase| {
                    emit_job_event(
                        &progress_app,
                        job_id,
                        progress_job_type.clone(),
                        "running".to_string(),
                        phase.to_string(),
                        Some(progress),
                    );
                },
            )
        }
        "trim_media" => {
            let progress_app = app_for_task.clone();
            let progress_job_type = job_type.clone();
            process_trim_media_job(&app_for_task, &state_for_task, &payload, move |progress, phase| {
                emit_job_event(
                    &progress_app,
                    job_id,
                    progress_job_type.clone(),
                    "running".to_string(),
                    phase.to_string(),
                    Some(progress),
                );
            })
        }
        "dependencies_install" => {
            let progress_app = app_for_task.clone();
            let progress_job_type = job_type.clone();
            process_dependencies_install_job(&app_for_task, move |phase| {
                emit_job_event(
                    &progress_app,
                    job_id,
                    progress_job_type.clone(),
                    "running".to_string(),
                    phase.to_string(),
                    parse_phase_progress(phase),
                );
            })
        }
        "dependencies_update" => {
            let progress_app = app_for_task.clone();
            let progress_job_type = job_type.clone();
            process_dependencies_install_job(&app_for_task, move |phase| {
                emit_job_event(
                    &progress_app,
                    job_id,
                    progress_job_type.clone(),
                    "running".to_string(),
                    phase.to_string(),
                    parse_phase_progress(phase),
                );
            })
        }
        "youtube_download" => {
            let progress_app = app_for_task.clone();
            let progress_job_type = job_type.clone();
            process_ytdlp_download_job(&app_for_task, &payload, move |progress, phase| {
                emit_job_event(
                    &progress_app,
                    job_id,
                    progress_job_type.clone(),
                    "running".to_string(),
                    phase.to_string(),
                    Some(progress),
                );
            })
        }
        _ => Err(format!("Unknown job type: {}", job_type)),
    })
    .await
    .map_err(|e| e.to_string())
    .and_then(|inner| inner);

    let cancel_requested = sqlx::query_scalar::<_, i64>(
        "SELECT cancellation_requested FROM jobs WHERE id = ?1",
    )
    .bind(job.id)
    .fetch_optional(&state.db_pool)
    .await
    .map(|opt| opt.unwrap_or(0) != 0)
    .unwrap_or(false);

    match (result, cancel_requested) {
        (_, true) => {
            let _ = sqlx::query(
                "UPDATE jobs
                 SET status = 'cancelled',
                     finished_at = COALESCE(finished_at, CURRENT_TIMESTAMP),
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?1",
            )
            .bind(job.id)
            .execute(&state.db_pool)
            .await;

            emit_job_event(
                app,
                job.id,
                job.job_type,
                "cancelled".to_string(),
                "Job cancelled".to_string(),
                None,
            );
        }
        (Ok(()), false) => {
            let _ = sqlx::query(
                "UPDATE jobs
                 SET status = 'done',
                     finished_at = CURRENT_TIMESTAMP,
                     updated_at = CURRENT_TIMESTAMP,
                     last_error = NULL
                 WHERE id = ?1",
            )
            .bind(job.id)
            .execute(&state.db_pool)
            .await;

            emit_job_event(
                app,
                job.id,
                job.job_type,
                "done".to_string(),
                "Job completed".to_string(),
                Some(100),
            );
        }
        (Err(error), false) => {
            let next_attempt = job.attempts + 1;
            if is_non_retryable_job_error(&job.job_type, &error) || next_attempt >= job.max_attempts {
                let _ = sqlx::query(
                    "UPDATE jobs
                     SET status = 'failed',
                         last_error = ?1,
                         finished_at = CURRENT_TIMESTAMP,
                         updated_at = CURRENT_TIMESTAMP
                     WHERE id = ?2",
                )
                .bind(error.clone())
                .bind(job.id)
                .execute(&state.db_pool)
                .await;

                emit_job_event(
                    app,
                    job.id,
                    job.job_type,
                    "failed".to_string(),
                    error,
                    None,
                );
            } else {
                let delay = backoff_seconds(next_attempt);
                let _ = sqlx::query(
                    "UPDATE jobs
                     SET status = 'queued',
                         last_error = ?1,
                         run_after = datetime('now', '+' || ?2 || ' seconds'),
                         updated_at = CURRENT_TIMESTAMP
                     WHERE id = ?3",
                )
                .bind(error.clone())
                .bind(delay)
                .bind(job.id)
                .execute(&state.db_pool)
                .await;

                emit_job_event(
                    app,
                    job.id,
                    job.job_type,
                    "queued".to_string(),
                    format!("Retry in {}s: {}", delay, error),
                    None,
                );
            }
        }
    }
}

fn parse_phase_progress(phase: &str) -> Option<u8> {
    let percent_idx = phase.find('%')?;
    let token = phase[..percent_idx].split_whitespace().last()?;
    let value = token.trim().parse::<u8>().ok()?;
    Some(value.min(100))
}

fn emit_job_event(
    app: &AppHandle,
    id: i64,
    job_type: String,
    status: String,
    message: String,
    progress: Option<u8>,
) {
    let _ = app.emit(
        "v2-job-updated",
        JobEvent {
            id,
            job_type,
            status,
            message,
            progress,
        },
    );
}

fn is_non_retryable_job_error(job_type: &str, error: &str) -> bool {
    let normalized_job = job_type.to_lowercase();
    let normalized_error = error.to_lowercase();

    let is_preview_job =
        normalized_job == "generate_video_thumbnail" || normalized_job == "generate_waveform";
    if !is_preview_job {
        return false;
    }

    normalized_error.contains("foreign key constraint failed")
        || normalized_error.contains("query returned no rows")
        || normalized_error.contains("no rows returned")
}

#[cfg(test)]
mod tests {
    #[test]
    fn marks_foreign_key_thumbnail_error_as_non_retryable() {
        assert!(super::is_non_retryable_job_error(
            "generate_video_thumbnail",
            "FOREIGN KEY constraint failed",
        ));
    }

    #[test]
    fn marks_missing_asset_query_error_as_non_retryable() {
        assert!(super::is_non_retryable_job_error(
            "generate_video_thumbnail",
            "Query returned no rows",
        ));
    }

    #[test]
    fn keeps_retry_for_transient_thumbnail_errors() {
        assert!(!super::is_non_retryable_job_error(
            "generate_video_thumbnail",
            "ffmpeg exited with code 1",
        ));
    }
}
