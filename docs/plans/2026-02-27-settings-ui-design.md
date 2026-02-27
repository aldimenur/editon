# Settings UI Visual Refresh Design

## Goal

Deliver a visual-only refresh of the `Settings` view with a minimal professional style, improving hierarchy, readability, and perceived quality without changing behavior or data flow.

## Scope

- Target screen: `Settings` (`SystemPage` + `SystemPanel`)
- Change type: visual polish only
- Constraint: no logic or feature changes

## Chosen Direction

- **Layout pattern:** Card Dashboard
- **Style tone:** Minimal professional
- **Brand constraint:** Full visual refresh within current component system

## Information Architecture

`Settings` will present three visual cards:

1. `Application`
2. `Updates`
3. `Maintenance` (system dependencies)

Each card uses a consistent structure:

- heading row
- short supporting text
- content body
- action row

A compact page header appears above the cards with title, short description, and version badge.

## Visual System

- **Typography:** use a deliberate sans stack (for example `Manrope` or `Plus Jakarta Sans`) with clearer heading/body contrast.
- **Palette:** neutral slate base with one restrained steel-blue accent.
- **Surfaces:** layered neutrals for page, card, and interactive elements.
- **Borders/elevation:** subtle borders and soft shadows for card separation.
- **Focus visibility:** stronger focus ring styling for accessibility.
- **Motion:** subtle entrance animation for cards and restrained button hover transitions.

## Component-Level Changes

- `Application` card
  - cleaner version presentation
  - refined metadata labels
- `Updates` card
  - redesigned status pill per phase: `idle`, `checking`, `available`, `downloading`, `ready`, `error`
  - clearer visual treatment for progress/loading container
- Buttons and controls
  - consistent button height, radius, and spacing
  - one clear primary action per card
- Informational and empty states
  - consistent icon, copy tone, and spacing

## Non-Goals

- no updater logic changes
- no store/API changes
- no navigation/flow changes
- no backend or Tauri config changes

## Data Flow and Behavior

Data flow remains unchanged:

- `SystemPage` continues to manage updater state and actions
- `SystemPanel` continues to render dependency status and actions
- existing states and status messages are preserved

Only class structure and styling are updated for presentation.

## Accessibility and Quality Bar

- visible keyboard focus on interactive controls
- maintain contrast-safe text for muted/status/error content
- preserve heading hierarchy and semantic sections
- responsive behavior verified at desktop and narrow widths

## Validation Plan

1. Visual check of `Settings` on desktop and narrow viewport.
2. Verify state visuals for each update phase.
3. Verify no behavior drift for:
   - check update
   - install update (availability gating)
   - dependency check/install/update actions
4. Run existing build/typecheck pipeline.

## Candidate Implementation Files

- `src/pages/system-page.tsx`
- `src/features/system/ui/system-panel.tsx`
- `src/app/styles/global.css`
- `src/app/styles/tokens.css` (only if token refinement is needed)
