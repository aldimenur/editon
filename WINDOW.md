# Window Top Bar Specification

## Purpose

Document the current top bar behavior so it can be recreated/redesigned later without losing functional details.

## Source of Truth

- `src/app/router/index.tsx`
- `src/app/styles/global.css`

## Top Bar Scope

The top bar is the native-window control surface rendered by `AppRouter`.

It contains:

1. Zen mode toggle button (Focus icon)
2. App title (`Editon`) and drag region
3. Window controls group:
   - Always-on-top toggle (Pin / PinOff)
   - Minimize
   - Maximize / Restore
   - Close

## Runtime Behavior

### Initialization

On mount, if running in Tauri runtime:

- Reads window state using `@tauri-apps/api/window`
  - `isAlwaysOnTop()`
  - `isMaximized()`
- Initializes local React state:
  - `alwaysOnTop`
  - `isMaximized`

### Zen Mode

- Enter: click Zen button in top bar
- Exit:
  - click floating `Exit` button
  - press `Escape`
- When Zen mode is enabled:
  - top bar is hidden
  - floating exit button is shown

### Window Controls

- **Always-on-top**
  - toggles with `setAlwaysOnTop(next)`
  - visual active state: `.window-btn.is-active`
- **Minimize**
  - `getCurrentWindow().minimize()`
- **Maximize/Restore**
  - checks `isMaximized()`
  - calls `maximize()` or `unmaximize()`
  - keeps local `isMaximized` in sync
- **Close**
  - `getCurrentWindow().close()`

### Non-Tauri Guard

All window-control actions return early when `isTauriRuntime()` is false.

## Drag Regions

Tauri drag regions are assigned with `data-tauri-drag-region` on:

- title node (`.topbar-title`)
- spacer node (`.window-drag-area`)

This preserves click/drag movement behavior for a frameless window UI.

## Current Component Structure

```tsx
window-layout
  window-topbar (hidden in zen)
    window-topbar-left
      zen-btn
      topbar-title (drag-region)
    window-drag-area (drag-region)
    window-topbar-right window-control-group
      always-on-top
      minimize
      maximize/restore
      close
  app-shell
    content-frame
      BrowserPage
```

## Styling Contract (Top Bar)

Defined in `src/app/styles/global.css`:

- `.window-layout`
- `.window-topbar`
- `.window-topbar-left`
- `.window-topbar-right`
- `.window-drag-area`
- `.topbar-title`
- `.window-btn`
- `.window-btn.is-active`
- `.window-btn.is-danger`
- `.window-btn.zen-btn`
- `.window-control-group`
- `.zen-float-btn`
- `.is-zen-mode .app-shell`

Core dimensions:

- top bar height: `34px`
- control button height: `24px`

## State Model (AppRouter)

- `zenMode: boolean`
- `alwaysOnTop: boolean`
- `isMaximized: boolean`

## Redesign Checklist

When redesigning, preserve these functional requirements:

1. Keep all 4 window actions functional in Tauri
2. Keep drag-region coverage for moving window
3. Keep zen mode enter/exit and `Esc` behavior
4. Keep maximize state label/intent (`Maximize` vs `Restore`)
5. Keep safe no-op behavior in non-Tauri runtime

## Notes

- All logic currently lives in `AppRouter`, not a dedicated top-bar component.
- If refactoring later, extract a `WindowTopBar` component but keep this behavior contract unchanged.
