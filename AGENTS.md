# AGENTS.md

This document defines the recommended frontend architecture for this project.
It is optimized for React + TypeScript + Vite + Tauri.

## Goals

- Keep UI and business logic separate.
- Keep feature boundaries explicit.
- Make files easy to find and refactor.
- Keep the app scalable without overengineering.

## Recommended Frontend Structure

```text
src/
  app/
    providers/
      theme-provider.tsx
      query-provider.tsx
    router/
      index.tsx
    styles/
      tokens.css
      global.css
    app.tsx
    main.tsx

  features/
    assets/
      api/
        assets-api.ts
      model/
        assets.types.ts
        assets.store.ts
      ui/
        assets-table.tsx
        asset-toolbar.tsx
        asset-pagination.tsx
      index.ts

    jobs/
      api/
        jobs-api.ts
      model/
        jobs.types.ts
      ui/
        jobs-table.tsx
      index.ts

    system/
      api/
        system-api.ts
      model/
        system.types.ts
      ui/
        system-panel.tsx
      index.ts

  entities/
    asset/
      model/
        asset.types.ts
      ui/
        asset-thumbnail.tsx
    job/
      model/
        job.types.ts

  shared/
    api/
      tauri-client.ts
    lib/
      format/
        file-size.ts
        date.ts
      guards/
        is-tauri.ts
    hooks/
      use-theme.ts
    ui/
      button.tsx
      table.tsx
      input.tsx
      status-text.tsx
    config/
      env.ts
      app-config.ts

  pages/
    browser-page.tsx
    jobs-page.tsx
    system-page.tsx
```

## Layer Rules

- `app/`: app composition only (providers, shell, routing, theme, global styles).
- `pages/`: route-level composition only; no direct Tauri invocation here.
- `features/`: user actions and workflows (scan, refresh, install dependencies).
- `entities/`: reusable domain pieces (asset/job display + domain model).
- `shared/`: low-level primitives, cross-feature utilities, generic UI.

## Import Direction

Use one-way dependencies:

- `app -> pages -> features -> entities -> shared`
- `shared` imports nothing from upper layers.
- Avoid feature-to-feature imports; move common code to `entities` or `shared`.

## File Naming Conventions

- Components: kebab-case, e.g. `asset-toolbar.tsx`
- Types: `*.types.ts`
- Store/state: `*.store.ts`
- API wrappers: `*-api.ts`
- Public entry per module: `index.ts`

## State Strategy

- Local UI state: component `useState`.
- Feature state: colocated store in `features/*/model`.
- Cross-feature app state: minimal shared store in `shared`.
- Derived state: computed selectors, not duplicated mutable state.

## API/Tauri Strategy

- Keep all Tauri invoke/listen wrappers in `shared/api` or `features/*/api`.
- Do not call `invoke` directly in page/components.
- Normalize API responses into typed models before UI render.

## Styling Strategy

- Use CSS variables for all tokens (color, spacing, border, typography).
- Theme via `data-theme` on `html` root.
- Keep components visually tight and minimal.
- Avoid one-off inline style objects except for dynamic pixel values.

## Testing Strategy

- Unit test pure helpers/selectors in `shared/lib` and `features/*/model`.
- Component test feature UI flows (scan controls, pagination, status output).
- Keep Tauri bindings mocked behind adapter functions.

## Migration Plan From Current State

Current code is intentionally flattened (`src/App.tsx`, `src/lib/*`, `src/styles/*`).
Use this order to evolve safely:

1. Move bootstrap files into `src/app/`.
2. Split `App.tsx` into `pages/*` and feature slices.
3. Move reusable UI fragments into `shared/ui`.
4. Introduce `entities` when duplication appears.
5. Add per-feature `index.ts` barrels for clean imports.

## Do/Do Not

Do:

- Keep modules small and focused.
- Export only module public APIs through `index.ts`.
- Keep strict TypeScript types on API boundaries.

Do not:

- Put all logic back into one file.
- Use global mutable state for page-local concerns.
- Mix Tauri command details directly into presentational components.
