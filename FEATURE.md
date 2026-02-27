# Feature Specification - Asset Gallery

## Goal

Build a media asset workflow where users can import folders once, keep them indexed, and use gallery-first actions (preview, play, trim) directly from the main browse experience.

## Scope

1. Users can import multiple parent folders that contain assets.
2. The app scans imported parent folders recursively.
3. Imported parent folders are persisted in DB (foundation for future folder watcher support).
4. Users can manually trigger sync to scan new/changed assets inside imported folders.
5. Main UI behaves like an asset gallery.
6. Sound assets render waveform preview content.
7. Video assets generate thumbnail previews to speed up gallery page load.
8. Image assets generate low-resolution thumbnails for gallery rendering.
9. Sound and video assets support trimming.
10. Asset discovery supports fuzzy search.
11. Explore screen shows all asset types in masonry-style layout.
12. Core asset actions (play, preview, trim) work inline inside gallery view.

## Functional Details

### 1) Folder Import and Persistence

- User can add more than one root folder.
- Each root folder is stored with metadata (path, date added, last scanned).
- Duplicate root path is prevented.

### 2) Recursive Scanning

- Scan walks subfolders under each imported root.
- Scan indexes supported media types (audio, video, image).
- Scan progress is visible to user (status, count, last processed file).

### 3) Manual Sync

- Sync re-checks imported roots and updates catalog for newly added or changed files.
- Sync does not require re-importing the folder.
- Sync updates root's last-scanned timestamp.

### 4) Gallery Experience

- Browse/explore view is gallery-first, not file-list-first.
- Explore screen combines all asset types in one masonry feed.
- Gallery should prioritize quick visual loading via pre-generated previews.

### 5) Preview Assets

- Audio: waveform preview (waveform visualization) available for fast inspection.
- Video: thumbnail (poster frame) preview generated and cached for faster listing.
- Image: low-resolution thumbnail (LQIP-style placeholder) generated and cached for gallery performance.

### 6) Inline Actions

- From gallery card/item, user can run play/preview/trim without leaving current screen.
- Inline interactions should keep context (scroll position/filter/search state).

### 7) Trimming

- Trimming is available for audio and video assets.
- Trim flow starts from inline gallery action.

### 8) Fuzzy Search

- Search supports approximate matching (not only exact string match).
- Search works across imported folders and all asset types.

## Terminology

- Waveform preview: visual representation of audio amplitude over time.
- Video thumbnail/poster frame: static frame image used as fast preview.
- Low-res thumbnail/LQIP: lightweight placeholder image for quick gallery paint.
- Inline trim: start/end adjustment (in-point/out-point) directly from gallery item.

## Non-Goals (Current Iteration)

- Real-time folder watcher automation (planned next after root persistence).
- Full editing suite beyond trim.
- Cloud sync/multi-device sync.

## Acceptance Criteria

- User can import multiple root folders and see them persisted after app restart.
- Recursive scan discovers assets in nested directories.
- Manual sync adds new assets and updates changed assets.
- Gallery loads with thumbnails/waveforms and stays responsive.
- Explore screen displays mixed asset types in masonry layout.
- Play/preview/trim actions are available inline in gallery cards.
- Fuzzy search returns relevant results for partial/approximate queries.

## Future Follow-up

- Add folder watchers on persisted roots for automatic background sync.
