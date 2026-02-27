# Image Thumbnail Generation Design

Date: 2026-02-27
Status: Approved

## Goal

Add image thumbnail generation to the existing preview pipeline so image assets get cached low-resolution thumbnails for faster gallery rendering.

## Decisions

- Use cached thumbnail files stored in the app thumbnail cache directory.
- Target image thumbnail size: max edge 160px.
- Reuse the existing thumbnail job pipeline (recommended Approach A), extending current video thumbnail flow to support image assets.
- Keep frontend thumbnail consumption unchanged via `asset_previews.thumbnail_path`.

## Architecture

### Current baseline

- The backend already generates and caches video thumbnails via async jobs.
- Thumbnail metadata is stored in `asset_previews` (`thumbnail_path`, `thumbnail_mtime_ms`, `thumbnail_version`).
- Frontend already reads `thumbnailPath` and falls back to source when missing.

### Proposed change

- Extend thumbnail enqueue logic to allow `image` assets in addition to `video`.
- Extend thumbnail generation job handler to branch by asset type:
  - `video`: keep existing ffmpeg thumbnail extraction flow.
  - `image`: decode image, resize to max edge 160px while preserving aspect ratio, write cached thumbnail file.
- Keep one thumbnail-ready event flow (`v2-thumbnail-ready`) and one DB upsert target (`asset_previews`).

## Data Flow

1. Scan/import inserts or updates assets.
2. Thumbnail enqueue checks asset type and staleness.
3. Job queue runs thumbnail generation job.
4. Generator writes thumbnail file to app thumbnail directory.
5. DB upsert updates `asset_previews.thumbnail_path`, `thumbnail_mtime_ms`, `thumbnail_version`, `generated_at`.
6. `v2-thumbnail-ready` is emitted for UI refresh.

### Trigger points

- Scan path: enqueue for media types that need thumbnail preview.
- Prefetch path (`v2_asset_prefetch`): enqueue image/video thumbnails when missing or stale.
- Post-trim path remains for video and is unaffected for image assets.

### Staleness model

- Thumbnail is considered fresh when `asset_previews.thumbnail_mtime_ms == assets.mtime_ms` and `thumbnail_path` is present.
- If stale or missing, a job is enqueued unless already queued/running for the same payload.

## File Format and Naming

- Thumbnail output is stored in app data `thumbnails` directory.
- Filename includes stable identity to avoid collisions and support regeneration (for example `asset_id + mtime_ms`).
- Output extension and encoder are implementation details, but output should be optimized for small gallery previews.

## Error Handling

- Decode, resize, and write failures should fail the job with clear error message.
- No DB upsert on failure.
- Existing worker retry/backoff policy is reused.
- Existing cancellation behavior is reused.

## Testing Strategy (TDD)

### Enqueue behavior

- Queues for `image` assets when thumbnail is missing/stale.
- Queues for `video` assets as before.
- Does not queue for `audio` assets.
- Does not queue duplicate queued/running jobs for same payload.
- Skips enqueue when thumbnail is fresh (`thumbnail_mtime_ms` matches).

### Generation behavior

- Given a valid image asset path, generated thumbnail file exists after job.
- Generated image respects max edge 160px.
- DB upsert populates `thumbnail_path` and updates `thumbnail_mtime_ms`.
- Existing video thumbnail generation behavior remains green.

## Backward Compatibility

- No frontend API changes required.
- Existing thumbnail consumers continue to read `thumbnailPath`.
- Existing video thumbnail jobs continue to work.

## Out of Scope

- Multiple thumbnail sizes per asset.
- Progressive placeholder variants in DB (LQIP/base64).
- UI redesign for thumbnail presentation.

## Risks and Mitigations

- Large image decode cost: mitigated by async background jobs and cache reuse.
- Storage growth from cached thumbnails: mitigated by small target size and deterministic regeneration on mtime.
- Regressions in video path: mitigated with focused regression tests and preserving current branch logic.
