CREATE TABLE IF NOT EXISTS assets (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    filename        TEXT NOT NULL,
    extension       TEXT NOT NULL,
    original_path   TEXT NOT NULL UNIQUE,
    root_path       TEXT,
    type            TEXT NOT NULL,
    file_size       INTEGER NOT NULL DEFAULT 0,
    mtime_ms        INTEGER NOT NULL DEFAULT 0,
    fingerprint     TEXT,
    tags            TEXT,
    date_created    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    date_modified   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS asset_media_info (
    asset_id        INTEGER PRIMARY KEY,
    duration_sec    REAL,
    width           INTEGER,
    height          INTEGER,
    codec           TEXT,
    sample_rate     INTEGER,
    bitrate         INTEGER,
    FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS asset_previews (
    asset_id             INTEGER PRIMARY KEY,
    thumbnail_path       TEXT,
    waveform_path        TEXT,
    waveform_data        TEXT,
    waveform_bars        INTEGER,
    generator_version    TEXT,
    waveform_mtime_ms    INTEGER,
    thumbnail_mtime_ms   INTEGER,
    thumbnail_version    TEXT,
    generated_at         TEXT,
    FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tags (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS asset_tags (
    asset_id         INTEGER NOT NULL,
    tag_id           INTEGER NOT NULL,
    PRIMARY KEY (asset_id, tag_id),
    FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE,
    FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS jobs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    job_type        TEXT NOT NULL,
    payload         TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'queued',
    priority        INTEGER NOT NULL DEFAULT 10,
    attempts        INTEGER NOT NULL DEFAULT 0,
    max_attempts    INTEGER NOT NULL DEFAULT 3,
    last_error      TEXT,
    run_after       TEXT,
    started_at      TEXT,
    finished_at     TEXT,
    created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS scan_roots (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    root_path         TEXT NOT NULL UNIQUE,
    date_added        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    date_last_scanned TEXT
);

CREATE INDEX IF NOT EXISTS idx_assets_type_id ON assets(type, id DESC);
CREATE INDEX IF NOT EXISTS idx_assets_modified ON assets(date_modified DESC);
CREATE INDEX IF NOT EXISTS idx_assets_root_path ON assets(root_path);
CREATE INDEX IF NOT EXISTS idx_jobs_status_priority ON jobs(status, priority, id);
CREATE INDEX IF NOT EXISTS idx_scan_roots_last_scanned ON scan_roots(date_last_scanned DESC, id DESC);

CREATE VIRTUAL TABLE IF NOT EXISTS assets_fts USING fts5(
    filename,
    original_path,
    tags,
    content='assets',
    content_rowid='id'
);

CREATE TRIGGER IF NOT EXISTS assets_ai AFTER INSERT ON assets BEGIN
  INSERT INTO assets_fts(rowid, filename, original_path, tags)
  VALUES (new.id, new.filename, new.original_path, COALESCE(new.tags, ''));
END;

CREATE TRIGGER IF NOT EXISTS assets_ad AFTER DELETE ON assets BEGIN
  INSERT INTO assets_fts(assets_fts, rowid, filename, original_path, tags)
  VALUES ('delete', old.id, old.filename, old.original_path, COALESCE(old.tags, ''));
END;

CREATE TRIGGER IF NOT EXISTS assets_au AFTER UPDATE ON assets BEGIN
  INSERT INTO assets_fts(assets_fts, rowid, filename, original_path, tags)
  VALUES ('delete', old.id, old.filename, old.original_path, COALESCE(old.tags, ''));
  INSERT INTO assets_fts(rowid, filename, original_path, tags)
  VALUES (new.id, new.filename, new.original_path, COALESCE(new.tags, ''));
END;
