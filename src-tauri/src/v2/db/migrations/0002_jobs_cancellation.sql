ALTER TABLE jobs ADD COLUMN cancellation_requested INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_jobs_run_after ON jobs(status, run_after, priority, id);
