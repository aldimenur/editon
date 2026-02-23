use crate::v2::jobs::retry::backoff_seconds;
use crate::v2::jobs::types::JobRow;
use crate::v2::models::JobEvent;
use crate::v2::state::AppState;
use crate::v2::{
    process_dependencies_install_job, process_generate_video_thumbnail_job,
    process_generate_waveform_job,
};
use sqlx::Row;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

pub async fn run_worker(app: AppHandle, state: AppState) {
    loop {
        if state.worker_shutdown.load(std::sync::atomic::Ordering::SeqCst) {
            break;
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
        "trim_media" => Ok(()),
        "dependencies_install" => process_dependencies_install_job(&app_for_task, |_| {}),
        "dependencies_update" => process_dependencies_install_job(&app_for_task, |_| {}),
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
            if next_attempt >= job.max_attempts {
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
