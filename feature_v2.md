# Feature V2 Proposal - Rebuild for Backend Efficiency

This is a proposal for a **backend-first V2** rebuild of Editon focused on high throughput, low UI latency, and predictable background processing.

## 1) V2 Objectives

- Make asset browsing feel instant on large libraries (50k+ files).
- Remove long blocking flows by moving work to durable background jobs.
- Eliminate repeated heavy processing (thumbnail/waveform rework).
- Keep the codebase modular so features can be shipped independently.

## 2) Core Problems in V1

- Tight coupling between scan/processing/UI progress logic.
- Per-feature ad-hoc background threads instead of one unified job system.
- Mixed metadata lifecycle (scan + enrich + update) makes retries and consistency harder.
- Heavy media operations compete with query operations on the same DB lock.

## 3) Proposed V2 Architecture

## 3.1 Service layers

- `ingest-service`: file discovery + watcher events -> normalized asset records.
- `index-service`: fast searchable index (name/path/tags/type).
- `media-service`: thumbnail/waveform/probe/trim pipelines.
- `job-service`: queue, scheduling, retries, cancellation, progress.
- `api-service` (Tauri commands): small command surface, no heavy logic inline.

## 3.2 Processing model

- Command handlers enqueue jobs and return quickly.
- Worker pool consumes jobs with explicit priorities:
  - `P0`: visible viewport assets (on-demand preview)
  - `P1`: newly discovered assets
  - `P2`: backfill/maintenance
- UI subscribes to event stream from job updates, not long command calls.

## 3.3 Data model split

- `assets` (identity + filesystem state)
- `asset_media_info` (duration/resolution/codec/etc)
- `asset_previews` (thumbnail_path, waveform_path, generated_at, generator_version)
- `asset_tags`, `tags` (normalized tags)
- `jobs` (type, payload, status, attempts, priority, next_run_at, error)

This split makes selective reprocessing simple (e.g., regenerate only previews for stale generator version).

## 4) Recommended Tech Stack for V2

## 4.1 Keep

- **Tauri 2** for desktop shell + Rust command backend.
- **SQLite** for local persistence.
- **FFmpeg/ffprobe** for robust media probing and transforms.

## 4.2 Replace / add

1. **DB access: move from `rusqlite` mutex model to `sqlx` with pooled async connections**
   - Why: removes global lock bottleneck and scales concurrent reads/writes better.
   - Use: `sqlx` + `sqlite` + migrations.

2. **Background jobs: add a proper queue executor**
   - Option A (recommended): custom lightweight queue in SQLite (`jobs` table) + Tokio workers.
   - Option B: `apalis` for stronger scheduling abstractions.
   - Why: one consistent retry/cancel/progress story.

3. **File watcher: keep `notify`, but feed a dedupe buffer + batching stage**
   - Why: prevents event storms and duplicate DB churn.

4. **Search index: add `tantivy` (or SQLite FTS5 as simpler first step)**
   - Recommended path:
     - Phase 1: SQLite FTS5 virtual table for filename/path/tags.
     - Phase 2: Tantivy if FTS5 is not enough.
   - Why: instant text search on large datasets.

5. **Preview pipeline caching**
   - Add content fingerprint (`blake3`) and generator version columns.
   - Why: regenerate only when file content or algorithm changes.

6. **Parallel media processing control**
   - Use `tokio::Semaphore` to cap CPU-heavy jobs.
   - Keep FFmpeg process concurrency separate from decode/image workers.

## 5) V2 Command API Shape (Minimal and Stable)

- `v2_scan_start(root_path)`
- `v2_scan_stop(scan_id)`
- `v2_assets_query(cursor, filters, sort, limit)`
- `v2_asset_prefetch(asset_ids)` (enqueue P0 preview jobs)
- `v2_jobs_subscribe()` (progress/events)
- `v2_asset_mutation(rename/delete/tags...)`
- `v2_media_trim(request)`
- `v2_dependencies_status/install/update`

Rule: commands should orchestrate, not perform heavy work directly.

## 6) Performance Strategy (Most Important)

## 6.1 Two-phase ingest

- Phase A (fast): discover files + basic metadata only.
- Phase B (async): enrich media info + previews via jobs.

Result: assets appear quickly; rich previews fill in progressively.

## 6.2 Viewport-first precompute

- Generate thumbnails/waveforms first for currently visible or soon-visible assets.
- Delay offscreen assets to lower priorities.

## 6.3 Deterministic invalidation

- Store `fingerprint`, `mtime`, `size`, `generator_version`.
- Recompute preview only when one of them changes.

## 6.4 Read optimization

- Add targeted indexes for common queries.
- Use projection queries for list view (avoid loading large JSON/blob fields).

## 7) Reliability Strategy

- Jobs are idempotent and resumable after crash.
- Retries with backoff and terminal failure state.
- Separate error channels:
  - recoverable media decode errors
  - dependency missing errors
  - user-actionable filesystem permission errors

## 8) Suggested Rust Crates (V2)

- Core runtime: `tokio`, `tracing`, `tracing-subscriber`
- DB: `sqlx` (sqlite + migrations)
- Queue (pick one): custom SQLite queue or `apalis`
- Search: SQLite FTS5 first, optional `tantivy`
- Hashing/fingerprint: `blake3`
- Media: keep `ffmpeg` process + optional `symphonia` for waveform fallback
- Image processing: keep `image` + `fast_image_resize` (good choice already)

## 9) Migration Plan

## Phase 0 - Foundation

- Create V2 schema and migration framework.
- Add unified jobs table + worker runtime.

## Phase 1 - Ingest and Query

- Implement fast scan -> assets table.
- Implement `v2_assets_query` with pagination and FTS.

## Phase 2 - Preview Jobs

- Thumbnail + waveform workers using job queue.
- Add viewport-first prefetch API.

## Phase 3 - Mutations and Trim

- Rebuild rename/delete/tag/trim on V2 pipeline.

## Phase 4 - Dependencies and YouTube

- Move dependency and yt-dlp actions behind same job/event model.

## Phase 5 - Cutover

- Feature flag V1/V2.
- Shadow-run + compare outputs.
- Remove V1 once parity and perf targets are met.

## 10) Target Metrics (Definition of Done)

- Initial asset list visible: < 500 ms for cached DB, < 2 s after first scan start.
- Scroll FPS stable with no visible stutter on 10k+ assets.
- Preview miss ratio after first warm pass: < 5%.
- Job failure rate (non-user errors): < 1%.
- No command blocking UI longer than 100 ms on average.

## 11) Recommended "Most Efficient" Path

If you want the fastest route with best ROI:

1. Keep Tauri + FFmpeg + existing media libs.
2. Switch DB layer to `sqlx` + migrations.
3. Introduce unified SQLite-backed job queue with Tokio workers.
4. Implement two-phase ingest + viewport-first preview jobs.
5. Use SQLite FTS5 before adopting a heavier search engine.

This gives the biggest performance and maintainability gain with the least rewrite risk.
