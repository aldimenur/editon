# Image Thumbnail Generation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Generate and cache image thumbnails (max edge 160px) using the existing thumbnail job pipeline so gallery previews load faster.

**Architecture:** Extend the current video thumbnail flow to support image assets in the same enqueue + worker + persistence path. Keep `asset_previews.thumbnail_path` as the only thumbnail source used by the frontend. Use deterministic cache files in app `thumbnails` directory and existing mtime-based freshness checks.

**Tech Stack:** Rust, Tauri 2, rusqlite/sqlx job queue, image crate for resize/encode, ffmpeg for video thumbnail path, cargo test.

---

### Task 1: Add testable thumbnail policy helpers

**Files:**

- Modify: `src-tauri/src/v2/mod.rs`
- Test: `src-tauri/src/v2/mod.rs` (new `#[cfg(test)] mod tests` block)

**Step 1: Write the failing test**

```rust
#[test]
fn thumbnail_policy_allows_image_and_video_only() {
    assert!(is_thumbnail_asset_type("image"));
    assert!(is_thumbnail_asset_type("video"));
    assert!(!is_thumbnail_asset_type("audio"));
}
```

**Step 2: Run test to verify it fails**

Run: `cargo test thumbnail_policy_allows_image_and_video_only`
Expected: FAIL with unresolved function `is_thumbnail_asset_type`

**Step 3: Write minimal implementation**

```rust
fn is_thumbnail_asset_type(asset_type: &str) -> bool {
    asset_type == "video" || asset_type == "image"
}
```

**Step 4: Run test to verify it passes**

Run: `cargo test thumbnail_policy_allows_image_and_video_only`
Expected: PASS

**Step 5: Commit**

```bash
git add src-tauri/src/v2/mod.rs
git commit -m "test: add thumbnail asset type policy helper"
```

### Task 2: Extend enqueue logic for image thumbnails

**Files:**

- Modify: `src-tauri/src/v2/mod.rs` (thumbnail enqueue helper)
- Test: `src-tauri/src/v2/mod.rs` (tests for allowed types and fresh/stale checks)

**Step 1: Write the failing test**

```rust
#[test]
fn enqueue_thumbnail_job_rejects_audio_type() {
    let should_enqueue = should_enqueue_thumbnail("audio", false, false);
    assert!(!should_enqueue);
}

#[test]
fn enqueue_thumbnail_job_accepts_image_when_missing_or_stale() {
    assert!(should_enqueue_thumbnail("image", true, false));
    assert!(should_enqueue_thumbnail("image", false, false));
}
```

**Step 2: Run test to verify it fails**

Run: `cargo test enqueue_thumbnail_job_`
Expected: FAIL with unresolved function `should_enqueue_thumbnail`

**Step 3: Write minimal implementation**

```rust
fn should_enqueue_thumbnail(asset_type: &str, is_missing: bool, is_fresh: bool) -> bool {
    if !is_thumbnail_asset_type(asset_type) {
        return false;
    }
    is_missing || !is_fresh
}
```

Then apply helper in existing enqueue function so DB checks preserve current behavior while allowing `image`.

**Step 4: Run test to verify it passes**

Run: `cargo test enqueue_thumbnail_job_`
Expected: PASS

**Step 5: Commit**

```bash
git add src-tauri/src/v2/mod.rs
git commit -m "feat: allow image assets in thumbnail enqueue flow"
```

### Task 3: Implement image thumbnail generation in job processor

**Files:**

- Modify: `src-tauri/Cargo.toml` (add image processing dependency if not present)
- Modify: `src-tauri/src/v2/mod.rs` (thumbnail processor function)
- Test: `src-tauri/src/v2/mod.rs` (unit tests for target dimension math)

**Step 1: Write the failing test**

```rust
#[test]
fn target_dimensions_clamp_max_edge_to_160() {
    assert_eq!(thumbnail_dimensions(4000, 2000, 160), (160, 80));
    assert_eq!(thumbnail_dimensions(800, 1600, 160), (80, 160));
    assert_eq!(thumbnail_dimensions(120, 100, 160), (120, 100));
}
```

**Step 2: Run test to verify it fails**

Run: `cargo test target_dimensions_clamp_max_edge_to_160`
Expected: FAIL with unresolved function `thumbnail_dimensions`

**Step 3: Write minimal implementation**

```rust
fn thumbnail_dimensions(width: u32, height: u32, max_edge: u32) -> (u32, u32) {
    let max_current = width.max(height);
    if max_current <= max_edge || max_current == 0 {
        return (width, height);
    }
    let ratio = max_edge as f64 / max_current as f64;
    let w = ((width as f64) * ratio).round().max(1.0) as u32;
    let h = ((height as f64) * ratio).round().max(1.0) as u32;
    (w, h)
}
```

Then extend `process_generate_video_thumbnail_job` logic:

- keep current ffmpeg branch for `video`.
- add `image` branch:
  - open source image
  - resize with max edge 160
  - encode and save thumbnail cache file
  - persist `thumbnail_path` + `thumbnail_mtime_ms` + `thumbnail_version`

**Step 4: Run test to verify it passes**

Run: `cargo test target_dimensions_clamp_max_edge_to_160`
Expected: PASS

**Step 5: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/v2/mod.rs
git commit -m "feat: generate cached thumbnails for image assets"
```

### Task 4: Wire job validation/worker naming consistency and regressions

**Files:**

- Modify: `src-tauri/src/v2/jobs/types.rs`
- Modify: `src-tauri/src/v2/jobs/worker.rs`
- Modify: `src-tauri/src/v2/mod.rs`
- Test: `src-tauri/src/v2/mod.rs` and targeted job payload tests in `src-tauri/src/v2/jobs/types.rs`

**Step 1: Write the failing test**

```rust
#[test]
fn validate_payload_accepts_thumbnail_job_asset_payload() {
    let payload = r#"{\"assetId\":1}"#;
    let result = validate_payload("generate_video_thumbnail", payload);
    assert!(result.is_ok());
}
```

Add complementary test for invalid `assetId`.

**Step 2: Run test to verify it fails**

Run: `cargo test validate_payload_accepts_thumbnail_job_asset_payload`
Expected: FAIL only if validation contract changed during refactor

**Step 3: Write minimal implementation**

Keep existing job type contract stable (or rename consistently in all call sites) and ensure worker still routes thumbnail jobs to the updated processor.

**Step 4: Run test to verify it passes**

Run: `cargo test validate_payload_accepts_thumbnail_job_asset_payload`
Expected: PASS

**Step 5: Commit**

```bash
git add src-tauri/src/v2/jobs/types.rs src-tauri/src/v2/jobs/worker.rs src-tauri/src/v2/mod.rs
git commit -m "refactor: keep thumbnail job routing and payload validation consistent"
```

### Task 5: End-to-end verification for scan/prefetch behavior

**Files:**

- Modify: `src-tauri/src/v2/mod.rs` (test scaffolding helpers only if needed)
- Test: `src-tauri/src/v2/mod.rs` (integration-like tests around enqueue query conditions)

**Step 1: Write the failing test**

```rust
#[test]
fn prefetch_enqueues_thumbnail_for_image_asset_when_stale() {
    // Arrange in-memory DB with image asset + stale/missing preview
    // Act by calling enqueue helper used by prefetch
    // Assert one queued thumbnail job exists
}
```

**Step 2: Run test to verify it fails**

Run: `cargo test prefetch_enqueues_thumbnail_for_image_asset_when_stale`
Expected: FAIL until DB setup/helper logic is complete

**Step 3: Write minimal implementation**

Add minimal test fixtures/helpers needed to create in-memory rows for assets + previews + jobs and execute the existing enqueue function.

**Step 4: Run test to verify it passes**

Run: `cargo test prefetch_enqueues_thumbnail_for_image_asset_when_stale`
Expected: PASS

**Step 5: Commit**

```bash
git add src-tauri/src/v2/mod.rs
git commit -m "test: verify image thumbnail enqueue in prefetch flow"
```

### Task 6: Full verification and docs alignment

**Files:**

- Modify: `FEATURE.md` (if needed to reflect finalized implementation details)
- Modify: `README.md` (only if behavior description needs update)

**Step 1: Run focused tests**

Run: `cargo test thumbnail_`
Expected: PASS

**Step 2: Run full backend tests**

Run: `cargo test`
Expected: PASS

**Step 3: Run app quality checks used in repo**

Run: `npm run lint`
Expected: PASS (or existing baseline warnings only)

**Step 4: Sanity check runtime flow**

Run: `npm run tauri dev`
Expected: Importing a folder with images eventually sets `thumbnailPath` and gallery renders cached thumbs.

**Step 5: Commit**

```bash
git add FEATURE.md README.md
git commit -m "docs: document image thumbnail generation behavior"
```
