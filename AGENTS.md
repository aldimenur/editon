# AGENTS.md

# Guidance for agentic coding in this repo

## Repository snapshot

- App: Editon (Tauri desktop app)
- Frontend: React + TypeScript + Vite + Tailwind CSS
- Backend: Rust (Tauri commands, SQLite, media tooling)
- Workspace roots:
  - Frontend: `src/`
  - Backend: `src-tauri/`

## Commands: build / lint / test

### Frontend (root)

- Install deps: `npm install`
- Dev (Tauri): `npm run tauri dev`
- Build (web assets): `npm run build`
- Preview (web): `npm run preview`

### Backend (Rust, from `src-tauri/`)

- Build: `cargo build`
- Run tests: `cargo test`

### Tauri packaging (root)

- Build app bundle: `npm run tauri build`

### Lint / format

- No ESLint or lint script is configured in `package.json`.
- Prettier is listed as a dev dependency, but no config file is present.
  - If formatting is needed, use default Prettier:
    `npx prettier --write "src/**/*.{ts,tsx,css}"`
  - Prefer minimal formatting and follow existing file style.

## Running a single test

### Rust (preferred single-test workflow)

- Run a single test by name:
  `cargo test test_name`
- Run tests in a specific module:
  `cargo test module_name::`
- Show stdout while testing:
  `cargo test test_name -- --nocapture`

### Frontend

- No test runner is configured (no Vitest/Jest scripts).
- If tests are added later, document the runner and single-test command here.

## Cursor / Copilot rules

- No Cursor rules found in `.cursor/rules/` or `.cursorrules`.
- No Copilot rules found in `.github/copilot-instructions.md`.

## Code style guidelines

### General

- Follow the existing style in each file. This repo mixes semicolons/no-semicolons.
- Use ASCII text unless the file already contains localized strings.
- Keep changes scoped; avoid refactors without a direct task requirement.
- Prefer atomic changes: small, focused edits that are easy to review and revert.
- When adding UI, extract new components into their own files for maintainability.

### TypeScript / React

#### Imports

- Prefer absolute imports via the `@/` alias (see `tsconfig.json`).
- Group imports roughly as:
  1. External libraries
  2. Internal modules (`@/`)
  3. Relative imports (`./`)
- Type-only imports use `import type { ... }` where appropriate.

#### Components and hooks

- Components are function components using `const Name = () => { ... }`.
- Component names are `PascalCase` (e.g., `Navbar`, `TagsDialog`).
- Custom hooks, if introduced, should use the `useX` naming pattern.

#### State and stores

- Zustand is used for shared state (see `src/stores/*`).
- Store setters use verbs (`setX`, `updateX`, `fetchX`).
- Persisted state uses `zustand/middleware` with `createJSONStorage`.

#### Types

- TypeScript is `strict` with `noUnusedLocals` and `noUnusedParameters`.
- Prefer explicit types for exported functions and public store interfaces.
- Use `type` for object shapes and `interface` for public contracts,
  but follow the local file pattern.

#### Naming

- Variables and functions: `camelCase`.
- Constants: `camelCase` or `SCREAMING_SNAKE_CASE` for true constants.
- Files and folders use a mix of `kebab-case` and `camelCase`; keep existing.

#### Error handling

- Use `try/catch` around async Tauri calls.
- Log errors with `console.error` and include context.
- Prefer returning safe defaults over throwing in UI code.

#### Tauri invoke usage

- Use `invoke` from `@tauri-apps/api/core`.
- Keep command names in sync with Rust `#[tauri::command]` functions.
- Types for Tauri payloads live in `src/types/tauri.ts`.

### Rust (Tauri backend)

#### Module organization

- Command handlers are in `src-tauri/src/*.rs` and wired in `lib.rs`.
- Keep new commands in a focused module and add to `generate_handler!`.

#### Naming

- Functions and variables: `snake_case`.
- Types and structs: `PascalCase`.
- Constants: `SCREAMING_SNAKE_CASE`.

#### Error handling

- Public Tauri commands return `Result<T, String>`.
- Convert internal errors with `map_err(|e| e.to_string())` or
  contextual messages (some are Indonesian).
- Avoid `unwrap()` in runtime paths; it is currently used mostly at startup.

#### Concurrency and state

- Shared DB connection is stored in `DbState` with `Arc<Mutex<Connection>>`.
- Long-running tasks should respect `is_busy` and `cancel_scan` flags
  where applicable.

#### Database access

- SQLite schema is created in `lib.rs` setup.
- Use prepared statements and pass parameters via `ToSql`.
- Prefer transactions for multi-step mutations.

## Project structure tips

- Frontend entry: `src/main.tsx` and `src/App.tsx`.
- Global utilities: `src/lib/utils.ts`.
- UI components: `src/components/` and `src/components/ui/`.
- Backend entry: `src-tauri/src/lib.rs` and `src-tauri/src/main.rs`.

## When adding new commands or types

- Add the Rust command in the relevant module and export it via `lib.rs`.
- Update TypeScript types in `src/types/tauri.ts` if payloads change.
- Update the frontend invoke usage to match payload shape.

## Build artifacts

- The repo contains `src-tauri/target/` outputs.
- Do not edit generated files under `src-tauri/target/` or `src-tauri/gen/`.

## Quick sanity checks before PR

- `npm run build` (typecheck + Vite build)
- `cargo test` in `src-tauri/` if Rust changes are involved
- `npm run tauri build` only when packaging validation is needed
