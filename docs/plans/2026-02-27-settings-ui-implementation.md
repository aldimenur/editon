# Settings UI Visual Refresh Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refresh the `Settings` page visuals into a minimal-professional card dashboard without changing behavior, store logic, or updater/system workflows.

**Architecture:** Keep all existing business logic in `SystemPage` and `SystemPanel`, then layer a new presentational structure (header + cards + status pills) with scoped CSS classes. Reuse current design tokens and only add narrowly scoped settings-specific styles/tokens where needed. Validate with build checks and manual state walkthroughs to guarantee no behavior drift.

**Tech Stack:** React 18 + TypeScript, Vite, existing global CSS token system (`tokens.css` + `global.css`), Tauri runtime update/dependency flows.

---

### Task 1: Restructure `SystemPage` into dashboard layout

**Files:**

- Modify: `src/pages/system-page.tsx:145`
- Test: Manual visual verification in running app

**Step 1: Write the failing test**

Create a manual acceptance checklist for current failure criteria:

```md
- Settings has no page header with title + supporting copy + version badge
- Updates section is not visually presented as a dedicated card block
- Card spacing/hierarchy is inconsistent with dashboard layout
```

**Step 2: Run test to verify it fails**

Run: `npm run dev`
Expected: FAIL against checklist above (current layout is pane-based, no dashboard header treatment).

**Step 3: Write minimal implementation**

Update markup in `SystemPage` to add:

```tsx
<section className="settings-page">
  <header className="settings-page-header">
    <div>
      <p className="settings-kicker">System Preferences</p>
      <h1>Settings</h1>
      <p className="settings-subtitle">Manage updates and runtime tools for Editon.</p>
    </div>
    <span className="settings-version-badge">v{appVersion}</span>
  </header>

  <section className="settings-card settings-updates-card">...</section>
  <SystemPanel ... />
</section>
```

**Step 4: Run test to verify it passes**

Run: `npm run dev`
Expected: PASS against checklist (header present, card structure visible, spacing hierarchy improved).

**Step 5: Commit**

```bash
git add src/pages/system-page.tsx
git commit -m "feat: introduce settings dashboard page structure"
```

### Task 2: Redesign `SystemPanel` visual anatomy as Maintenance card

**Files:**

- Modify: `src/features/system/ui/system-panel.tsx:21`
- Test: Manual visual verification in running app

**Step 1: Write the failing test**

Create a manual checklist for maintenance card styling failures:

```md
- System dependencies are not grouped into a polished card body
- Dependency statuses are plain text and hard to scan
- Actions are not visually prioritized/normalized
```

**Step 2: Run test to verify it fails**

Run: `npm run dev`
Expected: FAIL against checklist above.

**Step 3: Write minimal implementation**

Adjust `SystemPanel` structure and classes:

```tsx
<section className="settings-card settings-maintenance-card">
  <header className="settings-card-head">
    <div>
      <h2>Maintenance</h2>
      <p>Manage required tooling for downloads and media processing.</p>
    </div>
    <div className="row-actions settings-card-actions">...</div>
  </header>

  <div className="settings-dependency-grid">
    ...
    <span className={`settings-pill ${installed ? "is-ok" : "is-missing"}`}>
      ...
    </span>
  </div>

  <p className="settings-inline-status">{statusMessage}</p>
</section>
```

**Step 4: Run test to verify it passes**

Run: `npm run dev`
Expected: PASS against checklist (maintenance card structure and scanability improved).

**Step 5: Commit**

```bash
git add src/features/system/ui/system-panel.tsx
git commit -m "feat: refresh maintenance card presentation for settings"
```

### Task 3: Add update state pill treatment and progress container polish

**Files:**

- Modify: `src/pages/system-page.tsx:36`
- Modify: `src/app/styles/global.css:223`
- Test: Manual state walkthrough for `idle/checking/available/downloading/ready/error`

**Step 1: Write the failing test**

Document failing state visibility criteria:

```md
- Update phase is shown only as plain text; no clear visual state indicator
- Progress area lacks dedicated visual container
- Error/ready/available states are not instantly distinguishable
```

**Step 2: Run test to verify it fails**

Run: `npm run dev`
Expected: FAIL against state visibility checklist.

**Step 3: Write minimal implementation**

In `SystemPage`, add computed visual state class and badge:

```tsx
const updateToneClass = `settings-pill settings-pill-${updatePhase}`;

<span className={updateToneClass}>{updateStatusLabel}</span>;
{
  updatePhase === "downloading" ? (
    <div className="settings-update-progress-card">...</div>
  ) : null;
}
```

Add CSS selectors in `global.css`:

```css
.settings-pill { ... }
.settings-pill-idle { ... }
.settings-pill-checking { ... }
.settings-pill-available { ... }
.settings-pill-downloading { ... }
.settings-pill-ready { ... }
.settings-pill-error { ... }
.settings-update-progress-card { ... }
```

**Step 4: Run test to verify it passes**

Run: `npm run dev`
Expected: PASS (each update phase is visibly distinct, progress block appears integrated).

**Step 5: Commit**

```bash
git add src/pages/system-page.tsx src/app/styles/global.css
git commit -m "feat: add visual update state badges and progress styling"
```

### Task 4: Implement settings-specific spacing, typography, and responsive polish

**Files:**

- Modify: `src/app/styles/global.css:345`
- Modify: `src/app/styles/tokens.css:1` (only if new neutral/accent shades are needed)
- Test: Responsive manual verification at desktop + narrow width

**Step 1: Write the failing test**

Define failing visual polish criteria:

```md
- Card spacing is too tight and lacks hierarchy
- Heading/body typography contrast is weak
- Narrow viewport causes cramped header/action layout
```

**Step 2: Run test to verify it fails**

Run: `npm run dev`
Expected: FAIL against visual polish criteria.

**Step 3: Write minimal implementation**

Add scoped settings styles:

```css
.settings-page { ... }
.settings-page-header { ... }
.settings-kicker { ... }
.settings-subtitle { ... }
.settings-version-badge { ... }
.settings-card { ... }
.settings-card-head { ... }
.settings-card-actions { ... }

@media (max-width: 900px) {
  .settings-page-header { ... }
  .settings-card-head { ... }
}
```

If necessary, add only minimal token updates in `tokens.css` for card tint and accent contrast.

**Step 4: Run test to verify it passes**

Run: `npm run dev`
Expected: PASS (clear hierarchy, consistent spacing, usable on narrow viewport).

**Step 5: Commit**

```bash
git add src/app/styles/global.css src/app/styles/tokens.css
git commit -m "style: apply minimal-professional settings visual system"
```

### Task 5: Verify no behavior drift and finalize

**Files:**

- Verify: `src/pages/system-page.tsx`
- Verify: `src/features/system/ui/system-panel.tsx`
- Verify: `src/app/styles/global.css`
- Verify: `src/app/styles/tokens.css`

**Step 1: Write the failing test**

Create a final checklist of behavior invariants:

```md
- Check/Install update button enable/disable logic unchanged
- Dependency Check/Install/Update actions still invoke same handlers
- Status/error messages still render for same conditions
```

**Step 2: Run test to verify it fails (pre-fix baseline if applicable)**

Run: `npm run dev`
Expected: Establish baseline and compare interactions before/after visual changes.

**Step 3: Write minimal implementation**

Apply only final cleanup needed for consistent class naming and no dead selectors.

**Step 4: Run test to verify it passes**

Run:

```bash
npm run build
```

Expected: PASS (TypeScript + Vite build succeeds).

Then run manual interaction checks in `npm run dev` and confirm all invariants hold.

**Step 5: Commit**

```bash
git add src/pages/system-page.tsx src/features/system/ui/system-panel.tsx src/app/styles/global.css src/app/styles/tokens.css
git commit -m "refactor: complete settings visual refresh without behavior changes"
```
