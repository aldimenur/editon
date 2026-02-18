# Architecture Roadmap

This document outlines the target structure for Editon and a low-risk migration path.

## Goals

- Keep Tauri commands thin and move workflow logic into focused services.
- Keep React pages focused on composition, with business logic in feature hooks/stores.
- Reduce cross-file coupling by introducing feature-scoped API modules.
- Make large files easier to test and maintain by splitting responsibilities.

## Target Frontend Structure

```text
src/
  app/
    layout/
    providers/
  features/
    assets/
      api/
      hooks/
      model/
      ui/
    app-updates/
      hooks/
      model/
    youtube-download/
      api/
      hooks/
      model/
      ui/
  components/
    ui/
  stores/
  lib/
  types/
```

## Target Backend Structure

```text
src-tauri/src/
  app/
    bootstrap.rs
    state.rs
  commands/
    assets.rs
    folders.rs
    dependencies.rs
    youtube.rs
  services/
    asset_service.rs
    scan_service.rs
    watcher_service.rs
  infra/
    db/
    media/
    external/
  domain/
    asset.rs
    pagination.rs
  lib.rs
  main.rs
```

## Migration Plan

1. Frontend extraction phase
   - Move `invoke` wrappers into `src/features/**/api`.
   - Keep store and page behavior unchanged while switching imports.
2. Frontend composition phase
   - Split large pages (`assets`, `youtube-download`) into feature hooks and presentational components.
   - Keep app shell (`App.tsx`) focused on layout and page selection.
3. Backend extraction phase
   - Move command handlers out of `lib.rs` into `commands/*` modules.
   - Move scan/watcher/process logic from large modules into `services/*` and `infra/*`.
4. Validation phase
   - Add small, focused unit tests for utility and service layers.
   - Run formatting/type/lint checks after each phase.

## Current Step Implemented

- Added feature-scoped frontend APIs for assets and folder operations.
- Extracted app update lifecycle into `useAppUpdater` hook.
- Updated app and asset store to consume the new feature APIs.
- Split `assets` page logic into feature hooks (`query`, `selection`, `bulk actions`, `item actions`, `context menu`).
- Split `assets` page UI composition into feature components (`toolbar`, `list`, `dialogs`).
- Split `youtube-download` page into feature API, hook, and UI panels (`form`, `dependencies`).
