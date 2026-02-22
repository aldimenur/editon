pub mod retry;
pub mod types;
pub mod worker;

use crate::v2::models::JobDto;
use crate::v2::state::AppState;
use sqlx::Row;
use tauri::AppHandle;
use types::validate_payload;

pub fn start_worker(app: AppHandle, state: AppState) {
    tauri::async_runtime::spawn(async move {
        worker::run_worker(app, state).await;
    });
}

pub async fn enqueue_job(
    state: &AppState,
    job_type: &str,
    payload: &str,
    priority: i64,
) -> Result<i64, String> {
    validate_payload(job_type, payload)?;

    let result = sqlx::query(
        "INSERT INTO jobs(job_type, payload, status, priority, cancellation_requested)
         VALUES (?1, ?2, 'queued', ?3, 0)",
    )
    .bind(job_type)
    .bind(payload)
    .bind(priority)
    .execute(&state.db_pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(result.last_insert_rowid())
}

pub async fn list_jobs(state: &AppState, limit: u32) -> Result<Vec<JobDto>, String> {
    let rows = sqlx::query(
        "SELECT id, job_type, status, priority, attempts, payload, last_error, created_at, updated_at
         FROM jobs
         ORDER BY id DESC
         LIMIT ?1",
    )
    .bind(i64::from(limit))
    .fetch_all(&state.db_pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut out = Vec::with_capacity(rows.len());
    for row in rows {
        out.push(JobDto {
            id: row.try_get("id").map_err(|e| e.to_string())?,
            job_type: row.try_get("job_type").map_err(|e| e.to_string())?,
            status: row.try_get("status").map_err(|e| e.to_string())?,
            priority: row.try_get("priority").map_err(|e| e.to_string())?,
            attempts: row.try_get("attempts").map_err(|e| e.to_string())?,
            payload: row.try_get("payload").map_err(|e| e.to_string())?,
            last_error: row.try_get("last_error").map_err(|e| e.to_string())?,
            created_at: row.try_get("created_at").map_err(|e| e.to_string())?,
            updated_at: row.try_get("updated_at").map_err(|e| e.to_string())?,
        });
    }

    Ok(out)
}

pub async fn cancel_job(state: &AppState, job_id: i64) -> Result<bool, String> {
    let result = sqlx::query(
        "UPDATE jobs
         SET cancellation_requested = 1,
             status = CASE
                 WHEN status = 'queued' THEN 'cancelled'
                 WHEN status = 'running' THEN 'cancel_requested'
                 ELSE status
             END,
             finished_at = CASE WHEN status = 'queued' THEN CURRENT_TIMESTAMP ELSE finished_at END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?1
           AND status IN ('queued', 'running')",
    )
    .bind(job_id)
    .execute(&state.db_pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(result.rows_affected() > 0)
}
