use crate::v2::models::{JobDto, JobEvent};
use crate::v2::state::AppState;
use crate::v2::{process_generate_video_thumbnail_job, process_generate_waveform_job};
use rusqlite::{params, OptionalExtension};
use std::sync::atomic::Ordering;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

#[derive(Debug)]
struct JobRow {
    id: i64,
    job_type: String,
    payload: String,
    attempts: i64,
    max_attempts: i64,
}

pub fn enqueue_job(
    state: &AppState,
    job_type: &str,
    payload: &str,
    priority: i64,
) -> Result<i64, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO jobs(job_type, payload, status, priority) VALUES (?1, ?2, 'queued', ?3)",
        params![job_type, payload, priority],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

pub fn list_jobs(state: &AppState, limit: u32) -> Result<Vec<JobDto>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, job_type, status, priority, attempts, payload, last_error, created_at, updated_at
             FROM jobs ORDER BY id DESC LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![i64::from(limit)], |row| {
            Ok(JobDto {
                id: row.get(0)?,
                job_type: row.get(1)?,
                status: row.get(2)?,
                priority: row.get(3)?,
                attempts: row.get(4)?,
                payload: row.get(5)?,
                last_error: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }
    Ok(out)
}

pub fn start_worker(app: AppHandle, state: AppState) {
    thread::spawn(move || loop {
        if state.worker_shutdown.load(Ordering::SeqCst) {
            break;
        }

        match claim_next_job(&state) {
            Ok(Some(job)) => {
                process_job(&app, &state, job);
            }
            Ok(None) => {
                thread::sleep(Duration::from_millis(250));
            }
            Err(error) => {
                let _ = app.emit(
                    "v2-job-updated",
                    JobEvent {
                        id: 0,
                        job_type: "worker".to_string(),
                        status: "error".to_string(),
                        message: error,
                    },
                );
                thread::sleep(Duration::from_millis(500));
            }
        }
    });
}

fn claim_next_job(state: &AppState) -> Result<Option<JobRow>, String> {
    let mut conn = state.conn.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;

    let next = tx
        .query_row(
            "SELECT id, job_type, payload, attempts, max_attempts
             FROM jobs
             WHERE status = 'queued'
             ORDER BY priority ASC, id ASC
             LIMIT 1",
            [],
            |row| {
                Ok(JobRow {
                    id: row.get(0)?,
                    job_type: row.get(1)?,
                    payload: row.get(2)?,
                    attempts: row.get(3)?,
                    max_attempts: row.get(4)?,
                })
            },
        )
        .optional()
        .map_err(|e| e.to_string())?;

    if let Some(ref job) = next {
        tx.execute(
            "UPDATE jobs
             SET status = 'running',
                 attempts = attempts + 1,
                 started_at = CURRENT_TIMESTAMP,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?1",
            params![job.id],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(next)
}

fn process_job(app: &AppHandle, state: &AppState, job: JobRow) {
    let emit = |status: &str, message: String| {
        let _ = app.emit(
            "v2-job-updated",
            JobEvent {
                id: job.id,
                job_type: job.job_type.clone(),
                status: status.to_string(),
                message,
            },
        );
    };

    emit("running", format!("Running {}", job.job_type));

    let result: Result<(), String> = match job.job_type.as_str() {
        "prefetch_preview" => {
            thread::sleep(Duration::from_millis(15));
            Ok(())
        }
        "generate_waveform" => process_generate_waveform_job(app, state, &job.payload),
        "generate_video_thumbnail" => {
            process_generate_video_thumbnail_job(app, state, &job.payload)
        }
        "trim_media" => {
            thread::sleep(Duration::from_millis(20));
            Ok(())
        }
        "dependencies_install" => {
            thread::sleep(Duration::from_millis(30));
            Ok(())
        }
        "dependencies_update" => {
            thread::sleep(Duration::from_millis(30));
            Ok(())
        }
        _ => Err(format!("Unknown job type: {}", job.job_type)),
    };

    match result {
        Ok(()) => {
            let conn = state.conn.lock().map_err(|e| e.to_string());
            if let Ok(conn) = conn {
                let _ = conn.execute(
                    "UPDATE jobs
                     SET status = 'done',
                         finished_at = CURRENT_TIMESTAMP,
                         updated_at = CURRENT_TIMESTAMP,
                         last_error = NULL
                     WHERE id = ?1",
                    params![job.id],
                );
                emit(
                    "done",
                    format!("Completed {} payload={}", job.job_type, job.payload),
                );
            }
        }
        Err(error) => {
            let final_status = if job.attempts + 1 >= job.max_attempts {
                "failed"
            } else {
                "queued"
            };
            let conn = state.conn.lock().map_err(|e| e.to_string());
            if let Ok(conn) = conn {
                let _ = conn.execute(
                    "UPDATE jobs
                     SET status = ?1,
                         last_error = ?2,
                         updated_at = CURRENT_TIMESTAMP
                     WHERE id = ?3",
                    params![final_status, error.clone(), job.id],
                );
            }
            emit(final_status, error);
        }
    }
}
