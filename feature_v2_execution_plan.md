# Feature V2 Execution Plan

This plan turns `feature_v2.md` into a practical implementation roadmap.

## Scope

- Rebuild backend for high-throughput asset ingest, fast querying, and resilient background processing.
- Keep desktop shell (Tauri) and media stack (FFmpeg/ffprobe + image libs).
- Deliver V2 behind a feature flag, then cut over safely.

## Timeline (8 Weeks)

- Week 1-2: Foundation (schema, queue, worker runtime)
- Week 3-4: Ingest + query + FTS
- Week 5: Preview jobs (thumbnail/waveform) + viewport prefetch
- Week 6: Mutations + trim + reliability hardening
- Week 7: Dependencies/yt-dlp migration + observability
- Week 8: Shadow run, perf verification, cutover

## Milestone 1 - Foundation (Week 1-2)

## Deliverables

- Introduce `sqlx` + SQLite pool.
- Add migration system and initial V2 tables:
  - `assets`
  - `asset_media_info`
  - `asset_previews`
  - `tags`
  - `asset_tags`
  - `jobs`
- Add worker runtime with cancellation, retries, and status transitions.

## Tasks

- Create DB module split:
  - `src-tauri/src/v2/db/mod.rs`
  - `src-tauri/src/v2/db/schema.rs`
  - `src-tauri/src/v2/db/migrations/*`
- Add queue core:
  - `src-tauri/src/v2/jobs/mod.rs`
  - `src-tauri/src/v2/jobs/worker.rs`
  - `src-tauri/src/v2/jobs/retry.rs`
- Add typed job payloads:
  - `src-tauri/src/v2/jobs/types.rs`

## Acceptance

- App boots with V2 schema migration applied automatically.
- Jobs can be enqueued/dequeued, retried, and cancelled.
- No DB global mutex bottleneck in new V2 path.

## Milestone 2 - Ingest + Query (Week 3-4)

## Deliverables

- Fast two-phase ingest:
  - Phase A: discover + minimal metadata.
  - Phase B: enqueue enrich jobs.
- Cursor-based query API with filter/sort.
- Search via SQLite FTS5.

## Tasks

- Add ingest service:
  - `src-tauri/src/v2/ingest/mod.rs`
  - `src-tauri/src/v2/ingest/watcher.rs`
  - `src-tauri/src/v2/ingest/dedupe.rs`
- Add query/index service:
  - `src-tauri/src/v2/query/mod.rs`
  - `src-tauri/src/v2/query/fts.rs`
  - `src-tauri/src/v2/query/sql.rs`
- Add command handlers:
  - `v2_scan_start`
  - `v2_scan_stop`
  - `v2_assets_query`

## Acceptance

- First page appears quickly after scan starts (target from spec).
- Search/filter/sort works on large libraries.
- Watcher event bursts are deduped and batched.

## Milestone 3 - Preview Jobs (Week 5)

## Deliverables

- Unified thumbnail/waveform generation through job queue.
- Viewport-first prefetch API and priority scheduling (`P0/P1/P2`).
- Preview invalidation based on fingerprint + generator version.

## Tasks

- Add media service:
  - `src-tauri/src/v2/media/mod.rs`
  - `src-tauri/src/v2/media/thumbnail.rs`
  - `src-tauri/src/v2/media/waveform.rs`
  - `src-tauri/src/v2/media/fingerprint.rs`
- Add prefetch command:
  - `v2_asset_prefetch(asset_ids)`
- Add semaphore-based concurrency controls:
  - FFmpeg worker cap
  - image/waveform worker cap

## Acceptance

- Visible assets get previews first.
- Offscreen preview generation does not degrade scrolling/query latency.
- No redundant regen if fingerprint + version are unchanged.

## Milestone 4 - Mutations + Trim + Reliability (Week 6)

## Deliverables

- Rebuild file mutations (`rename/delete/tags`) on V2 store.
- Rebuild trim flow with durable jobs and progress updates.
- Harden retry/error classification and dead-letter handling.

## Tasks

- Add mutation service:
  - `src-tauri/src/v2/mutation/mod.rs`
  - `src-tauri/src/v2/mutation/tags.rs`
  - `src-tauri/src/v2/mutation/files.rs`
- Add trim service:
  - `src-tauri/src/v2/media/trim.rs`
- Add command handlers:
  - `v2_asset_mutation`
  - `v2_media_trim`

## Acceptance

- Mutations remain consistent across filesystem + DB + index.
- Trim jobs survive restart and resume safely.
- Recoverable errors retry with backoff; terminal failures are visible.

## Milestone 5 - Dependencies + YouTube + Observability (Week 7)

## Deliverables

- Move dependency installs and yt-dlp actions into job model.
- Unified event stream for all long-running work.
- Add structured telemetry and performance counters.

## Tasks

- Add integrations:
  - `src-tauri/src/v2/integrations/dependencies.rs`
  - `src-tauri/src/v2/integrations/ytdlp.rs`
- Add events API:
  - `v2_jobs_subscribe()`
  - `v2_dependencies_status/install/update`
- Add observability:
  - queue latency
  - job success/failure rates
  - preview hit/miss rate

## Acceptance

- No long blocking command for dependency/youtube workflows.
- All long tasks report standardized progress + terminal state.

## Milestone 6 - Cutover (Week 8)

## Deliverables

- V1/V2 feature flag and shadow-run comparison.
- Performance + correctness verification against targets.
- V2 default enabled; V1 retirement plan prepared.

## Tasks

- Add runtime switch (`V2_BACKEND_ENABLED`).
- Shadow mode writes to V2 while V1 remains serving.
- Compare sampled outputs: counts, tags, preview presence, query results.
- Finalize rollback strategy.

## Acceptance

- Meets target metrics in `feature_v2.md`.
- Critical workflows validated on production-like dataset.
- Rollback path tested.

## Risk Register and Mitigation

- DB migration risk
  - Mitigation: versioned migrations, backup before destructive changes.
- Worker starvation under heavy load
  - Mitigation: priority queues + per-class semaphores.
- Event storm from watcher
  - Mitigation: debounce + batch compaction + idempotent upsert.
- FFmpeg/yt-dlp external process instability
  - Mitigation: timeout, retries, structured stderr capture.

## Testing and Verification Strategy

- Unit tests
  - job transitions, retry/backoff, query builders, tag normalization.
- Integration tests
  - scan -> query -> preview generation end-to-end.
  - watcher rename/delete flows.
- Performance tests
  - 10k, 50k, 100k asset datasets.
  - first page latency, steady-state query p95, preview generation throughput.
- Soak tests
  - long-running queue stability + memory usage.

## Definition of Done Checklist

- V2 command surface fully available and documented.
- Job queue is durable, observable, and cancellable.
- Query and search latency targets are met.
- Viewport-first preview behavior is validated.
- Error handling and retry strategy proven in tests.
- V2 runs as default with rollback guard.

## Immediate Next 5 Actions

1. Add `sqlx` and migration scaffolding.
2. Implement `jobs` table + worker loop.
3. Ship `v2_assets_query` with FTS5.
4. Move thumbnail generation to queued jobs.
5. Add `v2_jobs_subscribe()` and baseline telemetry.
