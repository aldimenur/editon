# Frontend Folder Structure (V2 Baseline)

## Layout

- `src/App.tsx`
  - app shell composition (sidebar + section switch)
- `src/main.tsx`
  - app bootstrap + global styles

## Feature-first modules

- `src/features/assets/`
  - `components/assets-panel.tsx`
- `src/features/jobs/`
  - `components/jobs-panel.tsx`
- `src/features/settings/`
  - `components/settings-panel.tsx`
- `src/features/backend/`
  - `api/backend-api.ts` (Tauri command wrappers)

## Shared layer

- `src/shared/lib/`
  - `tauri-client.ts` (runtime guard + invoke wrapper)
- `src/shared/ui/`
  - `section-card.tsx` (reusable panel primitive)

## Styling

- `src/styles/global.css`
  - tokens, layout, components, responsive rules

## Why this structure

- Keeps backend command calls in one place (`features/backend/api`).
- Keeps UI by domain (`assets`, `jobs`, `settings`) so growth is predictable.
- Shared primitives avoid repeated low-level code.
- Easy evolution path:
  - add `hooks/` and `model/` inside each feature
  - add `stores/` only when cross-feature state is truly needed
