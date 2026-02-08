# AGENTS.md

## Purpose

Guide for agentic coding in `E:\Dev\editon`.
Prefer minimal, targeted changes that match local file conventions.

## Repo overview

- App: Editon (Tauri v2 desktop app)
- Frontend: React 18 + TypeScript + Vite + Tailwind CSS v4
- Backend: Rust + Tauri commands + SQLite (`rusqlite`)
- Roots:
  - `src/` frontend
  - `src-tauri/` backend

## Cursor/Copilot instruction files

- `.cursor/rules/`: not found
- `.cursorrules`: not found
- `.github/copilot-instructions.md`: not found
- If added later, follow them as repo-level instructions.

## Build, test, lint, format commands

### Frontend (repo root)

- Install deps: `npm install`
- Dev server: `npm run dev`
- Tauri dev app: `npm run tauri dev`
- Build (includes TypeScript check): `npm run build`
- Preview static build: `npm run preview`

### Backend (`src-tauri/`)

- Build: `cargo build`
- Run all tests: `cargo test`

### Packaging (repo root)

- Build desktop bundle: `npm run tauri build`

### Single-test commands (Rust)

- By test name: `cargo test test_name`
- By module path: `cargo test module_name::`
- Show println output: `cargo test test_name -- --nocapture`
- Require exact match: `cargo test test_name -- --exact`

### Lint/format status

- No `lint` script in `package.json`.
- No ESLint config detected.
- Prettier is installed without checked-in config.
- Optional TS/React formatting: `npx prettier --write "src/**/*.{ts,tsx,css}"`
- Optional Rust formatting/lint:
  - `cargo fmt`
  - `cargo clippy --all-targets --all-features`

### Frontend testing status

- No frontend test runner is configured (no Vitest/Jest scripts).
- If tests are added, update this file with single-test commands.

## Validation recommendations

- Frontend-only edits: run `npm run build`
- Rust-only edits: run `cargo test` in `src-tauri/`
- Cross-layer edits: run both commands above
- Run `npm run tauri build` only for packaging validation

## Code style guidelines

### General

- Follow surrounding style in the file you edit.
- Keep scope tight; avoid unrelated refactors.
- Prefer ASCII unless non-ASCII is already required by the file.
- Do not edit generated outputs in `src-tauri/target/` or `src-tauri/gen/`.
- Add comments only when logic is non-obvious.

### TypeScript/React

#### Imports

- `@/*` alias is configured in `tsconfig.json`.
- Prefer alias imports for internal modules when practical.
- Many files still use relative imports; keep consistency with nearby code.
- Preferred order:
  1. third-party packages
  2. internal alias imports (`@/`)
  3. relative imports
- Use `import type { ... }` for type-only imports where useful.

#### Components, hooks, and state

- Prefer function components (`function Name() {}` is common here).
- Naming:
  - components/types/interfaces: `PascalCase`
  - functions/variables: `camelCase`
  - constants: `SCREAMING_SNAKE_CASE` for true constants
- Hook/store names should follow `useX`.
- Shared app state uses Zustand (`src/stores/*`).
- Store actions should be verb-based (`setX`, `fetchX`, `updateX`, `toggleX`).
- Persisted stores use `persist` + `createJSONStorage(() => localStorage)`.

#### Types and contracts

- TS compiler is strict (`strict`, `noUnusedLocals`, `noUnusedParameters`).
- Prefer explicit types on exported APIs and store contracts.
- Avoid `any`; if necessary, keep it narrow and temporary.
- Keep frontend command types aligned with `src/types/tauri.ts`.
- Preserve external payload field names (often snake_case).

#### Error handling and formatting

- Wrap async Tauri/API calls in `try/catch`.
- Log context with `console.error("Context...", error)`.
- In UI code, prefer safe fallbacks over throwing.
- Semicolon/quote style is mixed; do not normalize entire files.
- Format only touched lines/blocks unless asked for full formatting.

### Rust/Tauri backend

#### Structure and wiring

- Entrypoints: `src-tauri/src/main.rs` and `src-tauri/src/lib.rs`.
- Add new logic in focused modules under `src-tauri/src/`.
- Register commands in `tauri::generate_handler!`.

#### Naming and signatures

- variables/functions: `snake_case`
- structs/enums/traits: `PascalCase`
- constants: `SCREAMING_SNAKE_CASE`
- Tauri commands should return `Result<T, String>`.

#### Errors, concurrency, and DB

- Convert internal errors with `map_err(|e| e.to_string())` or contextual messages.
- Avoid `unwrap()`/`expect()` in runtime code paths.
- Keep existing English/Indonesian tone for user-facing error strings.
- Shared DB state uses `Arc<Mutex<Connection>>` via `DbState`.
- Use transactions for multi-step DB mutations.
- Use bound SQL parameters (not interpolated SQL).
- Respect long-running control flags like `cancel_scan` and `is_busy`.

## Practical map

- Frontend entry: `src/main.tsx`, `src/App.tsx`
- Utilities: `src/lib/utils.ts`
- UI components: `src/components/`, primitives in `src/components/ui/`
- Pages: `src/pages/`
- Stores: `src/stores/`
- Tauri config: `src-tauri/tauri.conf.json`

## When changing Tauri commands

- Implement/update command in the right Rust module.
- Add it to `generate_handler!` in `src-tauri/src/lib.rs`.
- Keep frontend `invoke` names and payload keys in sync.
- Update `src/types/tauri.ts` for payload/result shape changes.

## Agent workflow

- Read nearby files before editing to mirror patterns.
- Make the smallest viable change, then verify with relevant commands.
- In handoff notes, state what was run and what was not run.
