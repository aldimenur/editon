# Backend Features (Current State)

This document is a deep scan of the Rust/Tauri backend currently implemented in `src-tauri/src`.

## Architecture Snapshot

- Runtime: Tauri 2 desktop backend with command bridge (`#[tauri::command]` + `generate_handler!`) in `src-tauri/src/lib.rs`.
- Persistence: SQLite (`rusqlite`) with shared state via `Arc<Mutex<Connection>>` in `src-tauri/src/models.rs`.
- Media pipelines:
  - Audio waveform extraction via Symphonia (`src-tauri/src/sound_lib.rs`).
  - Image thumbnail generation + metadata via `image` + `fast_image_resize` + WebP encoder (`src-tauri/src/image_lib.rs`).
  - Video thumbnail extraction via FFmpeg + WebP encode (`src-tauri/src/video_lib.rs`).
  - Trim audio/video clips via FFmpeg (`src-tauri/src/media_lib.rs`).
- Filesystem ingest/watch: recursive scan + live watcher (`notify`, `walkdir`) in `src-tauri/src/folder_lib.rs`.
- Dependency bootstrap/download: FFmpeg, Deno, yt-dlp installers in `src-tauri/src/ffmpeg.rs`, `src-tauri/src/deno.rs`, `src-tauri/src/yt_dlp.rs`.

## Exposed Tauri Command Surface

Registered in `src-tauri/src/lib.rs` (`generate_handler!`):

- Asset query and count
  - `get_assets_paginated` (`src-tauri/src/lib.rs`)
  - `get_count_assets` (`src-tauri/src/lib.rs`)
- Dependency management and cancellation
  - `download_dependencies` (`src-tauri/src/lib.rs`)
  - `cancel_scan` (`src-tauri/src/lib.rs`)
- Folder ingest and file operations
  - `scan_and_import_folder` (`src-tauri/src/folder_lib.rs`)
  - `trigger_folder_watcher` (`src-tauri/src/folder_lib.rs`)
  - `stop_folder_watcher` (`src-tauri/src/folder_lib.rs`)
  - `delete_file` (`src-tauri/src/folder_lib.rs`)
  - `rename_file` (`src-tauri/src/folder_lib.rs`)
- Database/tag operations
  - `clear_db` (`src-tauri/src/db_lib.rs`)
  - `get_available_tags` (`src-tauri/src/db_lib.rs`)
  - `update_asset_tags` (`src-tauri/src/db_lib.rs`)
  - `update_assets_tags` (`src-tauri/src/db_lib.rs`)
- Media processing jobs
  - `generate_missing_waveforms` (`src-tauri/src/sound_lib.rs`)
  - `generate_missing_thumbnails` (`src-tauri/src/image_lib.rs`)
  - `generate_missing_video_thumbnails` (`src-tauri/src/video_lib.rs`)
  - `trim_media` (`src-tauri/src/media_lib.rs`)
- YouTube pipeline
  - `check_dependencies` (`src-tauri/src/yt_dlp.rs`)
  - `get_ytdlp_version` (`src-tauri/src/yt_dlp.rs`)
  - `update_ytdlp` (`src-tauri/src/yt_dlp.rs`)
  - `run_ytdlp` (`src-tauri/src/yt_dlp.rs`)

## Implemented Features by Capability

### 1) Asset database and schema lifecycle

- Creates and manages `assets` table + indexes on startup (`src-tauri/src/lib.rs`).
- Validates schema shape and can recreate DB file on mismatch (`is_schema_valid` in `src-tauri/src/db_lib.rs`, startup path in `src-tauri/src/lib.rs`).
- Enables SQLite WAL + `synchronous=NORMAL` for performance (`src-tauri/src/lib.rs`).
- Adds normalized tag schema (`tags`, `asset_tags`) and migrates legacy CSV tags into relational mappings (`ensure_tag_schema` in `src-tauri/src/db_lib.rs`).

### 2) Search, filter, sort, and pagination API

- Paginated API with safety bounds (`page >= 1`, `page_size` clamped to `1..=200`) in `get_assets_paginated` (`src-tauri/src/lib.rs`).
- Tokenized search across:
  - `filename`
  - `original_path`
  - normalized tag names via join/subquery (`src-tauri/src/lib.rs`).
- Supports type filter (`all` / media type), exact tag filters, sortable columns (`filename`, `file_size`, `duration_sec`, `date_created`, `date_modified`) and sort order (`ASC`/`DESC`).
- Provides total count, total pages, and current page in `PaginatedResponse` (`src-tauri/src/models.rs`, `src-tauri/src/lib.rs`).

### 3) Folder scan and live synchronization

- Full recursive folder scan (`walkdir`) with cancellable background processing (`cancel_scan` atomic flag) in `scan_and_import_folder` (`src-tauri/src/folder_lib.rs`).
- Skips temporary/incomplete download artifacts (`.part`, `.tmp`, yt-dlp fragment patterns like `.f137`) via `is_temporary_download_artifact` (`src-tauri/src/folder_lib.rs`).
- Upserts discovered media into DB, computes duration for audio/video via ffprobe (`detect_media_duration_sec`) (`src-tauri/src/folder_lib.rs`).
- Live watcher (`notify`) supports create/modify/remove/rename tracking with event debounce and explicit watcher lifecycle start/stop (`src-tauri/src/folder_lib.rs`).
- Rename handling updates DB paths safely and emits rename payload (`handle_rename_in_db`, `FileRenamedPayload`) (`src-tauri/src/folder_lib.rs`).

### 4) Tagging system

- Single-asset and bulk tag updates (`update_asset_tags`, `update_assets_tags`) with normalization:
  - trims whitespace
  - lowercases
  - deduplicates
  - updates both denormalized `assets.tags` and relational join tables (`src-tauri/src/db_lib.rs`).
- Lists all available tags in sorted order (`get_available_tags`) (`src-tauri/src/db_lib.rs`).

### 5) Image thumbnail and metadata pipeline

- Generates missing image thumbnails only when `thumbnail_path IS NULL` (`generate_missing_thumbnails`) (`src-tauri/src/image_lib.rs`).
- Reads dimensions/format metadata for non-SVG images (`get_image_metadata`) (`src-tauri/src/image_lib.rs`).
- Uses fast resize + lossless WebP output and writes thumbnails to app-data thumbnails folder (`src-tauri/src/image_lib.rs`).
- SVG special handling: stores original path as thumbnail source instead of raster thumbnail generation (`src-tauri/src/image_lib.rs`).

### 6) Video thumbnail pipeline

- Generates missing video thumbnails (`thumbnail_path IS NULL`) using FFmpeg single-frame extraction (`generate_video_thumbnail_buffer`) (`src-tauri/src/video_lib.rs`).
- Resizes frame output, encodes WebP, writes to app-data thumbnails directory (`src-tauri/src/video_lib.rs`).
- On generation failure, marks `thumbnail_path = ''` to avoid infinite retry loops (`src-tauri/src/video_lib.rs`).

### 7) Audio waveform extraction pipeline

- Finds audio assets missing waveforms (`waveform_data = '[]' OR NULL`) and processes them in background (`generate_missing_waveforms`) (`src-tauri/src/sound_lib.rs`).
- Decodes audio with Symphonia, computes per-packet peaks, resamples to fixed bar count (`get_audio_waveform`) (`src-tauri/src/sound_lib.rs`).
- Stores waveform JSON per asset and updates `date_modified` (`src-tauri/src/sound_lib.rs`).

### 8) Media trimming (audio/video)

- Trims audio/video via FFmpeg stream copy (`-c copy`) using `start_sec`/`end_sec` bounds (`trim_media`) (`src-tauri/src/media_lib.rs`).
- Supports optional output path or auto-generates timestamped path under app-data `trimmed/<media_type>/` (`resolve_output_path`) (`src-tauri/src/media_lib.rs`).
- After trim:
  - audio: generates waveform
  - video: generates thumbnail
  - upserts trimmed result into `assets` table (`upsert_trimmed_asset`) (`src-tauri/src/media_lib.rs`).

### 9) YouTube download and dependency tooling

- Dependency status check for yt-dlp/ffmpeg/ffprobe/deno binaries in app-data `bin` (`check_dependencies`) (`src-tauri/src/yt_dlp.rs`).
- yt-dlp downloader with progress events, minimum size guard, and SHA256 verification against upstream checksum file (`download_ytdlp`) (`src-tauri/src/yt_dlp.rs`).
- yt-dlp update flow with backup/restore fallback (`update_ytdlp`) (`src-tauri/src/yt_dlp.rs`).
- Executes yt-dlp commands asynchronously and streams stdout/stderr to UI events (`run_ytdlp`) (`src-tauri/src/yt_dlp.rs`).
- Batch dependency installer command (`download_dependencies`) orchestrates FFmpeg + Deno + yt-dlp under busy lock (`src-tauri/src/lib.rs`).

### 10) FFmpeg and Deno installers

- FFmpeg installer (`download_ffmpeg`) on Windows:
  - downloads zip
  - emits progress
  - verifies SHA256 via `.sha256` endpoint
  - extracts `ffmpeg.exe` + `ffprobe.exe` into app-data bin (`src-tauri/src/ffmpeg.rs`).
- Deno installer (`download_deno`) on Windows:
  - tries multiple download mirrors
  - verifies checksum (`.sha256sum`/`.sha256`)
  - validates minimum binary size
  - falls back to PowerShell installer if direct download fails (`src-tauri/src/deno.rs`).

## Backend-Emitted Runtime Events

Events emitted to frontend listeners:

- Scan and watcher events (`src-tauri/src/folder_lib.rs`)
  - `scan-progress`
  - `file-added`
  - `file-removed`
  - `file-renamed`
- Processing progress (`src-tauri/src/image_lib.rs`, `src-tauri/src/video_lib.rs`, `src-tauri/src/sound_lib.rs`)
  - `thumbnail-progress`
  - `waveform-progress`
- Dependency/downloader progress (`src-tauri/src/ffmpeg.rs`, `src-tauri/src/deno.rs`, `src-tauri/src/yt_dlp.rs`)
  - `ffmpeg-download-progress`
  - `deno-download-progress`
  - `yt-dlp-download-progress`
  - `ytdlp-output`
  - `ytdlp-error`

## Operational Constraints and Caveats (as implemented)

- Auto-download installers for FFmpeg and Deno are Windows-only (`src-tauri/src/ffmpeg.rs`, `src-tauri/src/deno.rs`).
- Folder scan/watch and media-processing commands are asynchronous/background-oriented and rely on event listeners for progress UX.
- `cancel_scan` controls scan/waveform/thumbnail loops that check the shared atomic flag; cancellation responsiveness depends on loop checkpoints.
- Thumbnail generation marks failed videos with empty thumbnail path (`''`) to prevent endless retries (`src-tauri/src/video_lib.rs`).
- Trim operation uses stream copy (`-c copy`), so cut precision depends on container/keyframe constraints (`src-tauri/src/media_lib.rs`).

## File Index (Scanned)

- `src-tauri/src/lib.rs`
- `src-tauri/src/db_lib.rs`
- `src-tauri/src/folder_lib.rs`
- `src-tauri/src/media_lib.rs`
- `src-tauri/src/sound_lib.rs`
- `src-tauri/src/image_lib.rs`
- `src-tauri/src/video_lib.rs`
- `src-tauri/src/yt_dlp.rs`
- `src-tauri/src/ffmpeg.rs`
- `src-tauri/src/deno.rs`
- `src-tauri/src/models.rs`
- `src-tauri/src/utils.rs`
- `src-tauri/src/main.rs`
