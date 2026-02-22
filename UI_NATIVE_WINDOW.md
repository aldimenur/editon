# Native Window UI Spec

## Goals

- Tight spacing and minimal padding across shell and panes.
- Native-feeling top bar for desktop window controls.
- Zen/focus mode to maximize usable content height.

## Top Bar Controls

Top bar includes these controls:

- Left side:
  - `Zen` button (enter focus mode).
- Right side:
  - `Pin` button (always on top toggle).
  - `-` button (minimize window).
  - `Max` / `Restore` button (toggle maximize).
  - `x` button (close window).

## Zen/Focus Mode Behavior

- Triggered from left-side `Zen` button.
- Hides the top bar while active.
- Forces app shell to full height (`100vh`) for maximum content space.
- Shows a compact floating `Exit Zen` button at top-left for recovery.

## Styling Direction

- Compact chrome: 34px top bar height.
- Control buttons with reduced radius and tighter horizontal spacing.
- Reduced paddings in rail, pane, table cells, toolbar rows, and content frame.
- Keep existing token system and theme compatibility.

## Current Implementation Map

- App shell and top bar logic: `src/app/router/index.tsx`
- Tight spacing and top bar styles: `src/app/styles/global.css`

## Notes

- Window actions are active in Tauri runtime and gracefully no-op in non-Tauri web preview.
- Progress and page content remain unchanged; this update focuses on shell/chrome density and window control UX.
