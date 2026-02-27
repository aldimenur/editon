# Hide Backend Terminal Windows Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ensure all backend process launches from the Tauri Rust backend run without showing a Windows terminal window.

**Architecture:** Centralize process creation behind a helper that applies Windows-only `CREATE_NO_WINDOW` flags and returns a configured `std::process::Command`. Route every existing backend `Command::new(...)` call through this helper so behavior is consistent now and for future call sites. Keep non-Windows behavior unchanged with `cfg` gates.

**Tech Stack:** Rust, Tauri 2 backend, `std::process::Command`, Windows `std::os::windows::process::CommandExt`.

---

### Task 1: Add hidden-command helper

**Files:**

- Modify: `src-tauri/src/v2/mod.rs`

**Step 1: Write the failing test**

Create a unit test in `src-tauri/src/v2/mod.rs` (inside `#[cfg(test)]`) that calls a new helper and asserts behavior indirectly by ensuring helper exists and returns a `Command` that can accept args and execute in the same way as before. On Windows-only, test can execute a no-op command and verify success.

**Step 2: Run test to verify it fails**

Run: `cargo test -p editon --manifest-path src-tauri/Cargo.toml v2::mod -- --nocapture`
Expected: FAIL because helper does not exist.

**Step 3: Write minimal implementation**

Add:

- Windows import: `std::os::windows::process::CommandExt`
- Windows const: `const CREATE_NO_WINDOW: u32 = 0x08000000`
- Helper:
  - `fn hidden_command(program: impl AsRef<std::ffi::OsStr>) -> Command`
  - Creates `Command::new(program)`
  - On Windows, applies `.creation_flags(CREATE_NO_WINDOW)`
  - Returns configured command

**Step 4: Run test to verify it passes**

Run: `cargo test -p editon --manifest-path src-tauri/Cargo.toml v2::mod -- --nocapture`
Expected: PASS.

**Step 5: Commit**

```bash
git add src-tauri/src/v2/mod.rs
git commit -m "fix: add hidden process launcher for Windows backend commands"
```

### Task 2: Route all backend command executions through helper

**Files:**

- Modify: `src-tauri/src/v2/mod.rs`

**Step 1: Write the failing test**

Add a targeted unit test (or snapshot/structural assertion in test module) ensuring command-building entry points now use helper function. If structural test is impractical, this step can be a failing compile check by temporarily referencing helper-required API at each call site.

**Step 2: Run test to verify it fails**

Run: `cargo test -p editon --manifest-path src-tauri/Cargo.toml`
Expected: FAIL before replacing call sites.

**Step 3: Write minimal implementation**

Replace these call sites with `hidden_command(...)`:

- yt-dlp probe (`v2_ytdlp_probe`)
- yt-dlp download spawn (`process_ytdlp_download_job`)
- ffmpeg thumbnail (`process_generate_video_thumbnail_job`)
- ffmpeg trim primary + fallback (`process_trim_media_job`)
- binary verify (`verify_binary`)
- PowerShell runner (`run_powershell_script`)

**Step 4: Run test to verify it passes**

Run: `cargo test -p editon --manifest-path src-tauri/Cargo.toml`
Expected: PASS.

**Step 5: Commit**

```bash
git add src-tauri/src/v2/mod.rs
git commit -m "fix: hide Windows console windows for backend process execution"
```

### Task 3: Verify behavior and prevent regression

**Files:**

- Modify (if needed): `src-tauri/src/v2/mod.rs`
- Optional docs note: `docs/plans/2026-02-27-hide-backend-terminal-windows.md`

**Step 1: Verify build/check**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: PASS.

**Step 2: Manual runtime verification**

Run backend flows from UI:

- Dependency install
- yt-dlp probe/download
- ffmpeg thumbnail/trim jobs

Expected: no extra terminal window appears on Windows; functionality unchanged.

**Step 3: If any command still flashes terminal, patch that specific call site**

Use helper consistently and re-run checks.

**Step 4: Final verification**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: PASS.

**Step 5: Commit**

```bash
git add src-tauri/src/v2/mod.rs docs/plans/2026-02-27-hide-backend-terminal-windows.md
git commit -m "docs: add implementation plan for hidden backend command windows"
```
