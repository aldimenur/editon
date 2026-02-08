# Sidebar Design Spec (Editon)

This document captures the visual style used in `src/components/Sidebar.tsx` so you can recreate it consistently.

## 1) Visual Direction

- Minimal, desktop-app sidebar with sharp edges (`rounded-none` in most controls).
- Soft glass panel feel from semi-transparent background + blur support.
- Tight typography and compact vertical rhythm.
- Subtle separators and muted hover states; active items are stronger but still restrained.

## 2) Sidebar Frame

- Container element: `aside`.
- Width:
  - Expanded: `220px` (`w-[220px]`)
  - Minimized: `58px` (`w-[58px]`)
- Layout: `flex flex-col`.
- Divider to content: `border-r border-sidebar-border`.
- Background: `bg-sidebar/95` with fallback blur enhancement:
  - `supports-[backdrop-filter]:bg-sidebar/80`
  - `supports-[backdrop-filter]:backdrop-blur-xl`
- Text color: `text-sidebar-foreground`.
- Minimize animation: `transition-[width] duration-200 ease-out`.

## 3) Structure + Dimensions

1. **Header Row**
   - Height: `44px` (`h-11`)
   - Horizontal padding: `14px` (`px-3.5`)
   - Bottom border: `border-b border-sidebar-border/90`
   - Contains app title block + collapse button.

2. **Section Label (expanded only)**
   - Padding: `px-3.5 py-1.5`
   - Font: `10px`, slight tracking (`tracking-[0.04em]`)
   - Bottom border: `border-b border-sidebar-border/80`
   - Text: muted (`text-muted-foreground`).

3. **Nav List**
   - Area: `flex-1 py-2 overflow-y-auto`
   - Each item height: `32px` (`h-8`)
   - Item horizontal padding: `14px` (`px-3.5`)

4. **Footer Area**
   - Top border: `border-t border-sidebar-border/90`
   - Footer controls row: `p-2`
   - Expanded: `items-center justify-between`
   - Minimized: `flex-col items-center`

## 4) Typography Scale

- Brand title: `13px`, medium, tight leading, slight tracking.
- Brand subtitle: `10px`, muted.
- Section label (“Library”): `10px`, muted, uppercase-feel tracking.
- Nav label: `12px`.
- Count badge and task metadata: `10px`.
- Task card title: `11px`, semibold.

## 5) Icon System

- Sidebar icons are rendered at `12px`.
- Icon hitbox wrapper: `20x20` (`h-5 w-5`) centered.
- Default icon color: muted; becomes foreground on hover/active.
- YouTube icon is intentionally red (`text-red-500`) to signal source context.

## 6) Color Tokens (Use These, Not Hardcoded Colors)

Token usage in sidebar classes:

- Base panel: `sidebar`
- Main text: `sidebar-foreground`
- Borders: `sidebar-border`
- Hover/active surface: `sidebar-accent`
- Secondary text/meta: `muted-foreground`
- Generic border surfaces in badges/cards: `border`, `card`, `muted`

Defined in `src/App.css`:

- Light mode
  - `--sidebar: oklch(0.98 0 0)`
  - `--sidebar-foreground: oklch(0.25 0 0)`
  - `--sidebar-accent: oklch(0.94 0 0)`
  - `--sidebar-border: oklch(0.90 0 0)`
- Dark mode
  - `--sidebar: oklch(0.2 0.006 285)`
  - `--sidebar-foreground: oklch(0.85 0.01 285)`
  - `--sidebar-accent: oklch(0.25 0.006 285)`
  - `--sidebar-border: oklch(0.22 0.006 285)`

## 7) Interaction States

### Collapse button

- Base: ghost button, `h-7 w-7`, square edges (`rounded-none`), transparent border.
- Hover: `hover:border-sidebar-border hover:bg-sidebar-accent/45`
- Active press: `active:bg-sidebar-accent/60`

### Nav item

- Base: transparent with invisible y-border for stable layout.
- Hover: `hover:bg-sidebar-accent/30 hover:border-sidebar-border/50`
- Active press: `active:bg-sidebar-accent/45`
- Selected: `bg-sidebar-accent/60 border-sidebar-border/80`

### Count badge

- Compact rectangular chip:
  - `px-1.5 py-0.5`
  - `bg-muted/30`
  - `border border-border/70`
  - `rounded-none`
  - `min-w-5 text-center`

### Progress card

- Entrance animation: `animate-in slide-in-from-bottom-2 fade-in duration-200`
- Surface: `bg-card/40 border border-border/70 rounded-none p-2`

## 8) Motion + Behavior

- Sidebar width transition is the primary motion.
- Background task panel appears with short fade/slide animation.
- Spinner for counting state uses `Loader2` with `animate-spin`.
- Tooltips are simplified using `title` when minimized.

## 9) Rebuild Recipe (Tailwind-First)

If recreating from scratch, keep this order:

1. Build fixed-width sidebar shell with tokenized bg/border/text + blur fallback.
2. Add 44px header with brand text and square icon button.
3. Add section label (expanded only).
4. Render 32px nav rows with icon + label + count badge.
5. Apply hover/active/selected opacities exactly.
6. Add footer with mode toggle and import button variants for expanded/minimized.
7. Add optional progress panel above footer with subtle card styling.

## 10) Class Snapshots (Quick Copy)

### Sidebar shell

```tsx
"flex flex-col border-r border-sidebar-border bg-sidebar/95 text-sidebar-foreground supports-[backdrop-filter]:bg-sidebar/80 supports-[backdrop-filter]:backdrop-blur-xl transition-[width] duration-200 ease-out";
```

### Nav item base

```tsx
"group relative flex h-8 items-center gap-2.5 px-3.5 cursor-pointer border-y border-transparent hover:bg-sidebar-accent/30 hover:border-sidebar-border/50 active:bg-sidebar-accent/45";
```

### Selected nav item delta

```tsx
"bg-sidebar-accent/60 border-sidebar-border/80";
```

### Count badge

```tsx
"px-1.5 py-0.5 bg-muted/30 border border-border/70 rounded-none min-w-5 text-center";
```

## 11) Applying This Style to a Normal Page

Use the same visual language, but scale spacing and hierarchy for content areas.

### Page shell

- Root: `min-h-screen bg-background text-foreground`
- Page container: `mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 py-6`
- Main content blocks should keep sharp corners and soft borders:
  - `rounded-none border border-border/70 bg-card/40`

Example:

```tsx
<main className="min-h-screen bg-background text-foreground">
  <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 py-6">
    {/* content */}
  </div>
</main>
```

### Top bar (page-level replacement for sidebar header)

- Height: `h-11`
- Surface: `border-b border-sidebar-border/90 bg-sidebar/60 supports-[backdrop-filter]:backdrop-blur-xl`
- Title stack:
  - Main: `text-[13px] font-medium leading-none tracking-[0.01em]`
  - Sub: `text-[10px] text-muted-foreground mt-1`

### Section cards

- Card wrapper: `border border-border/70 bg-card/40 rounded-none`
- Card header: `h-10 px-3.5 border-b border-sidebar-border/70 flex items-center`
- Card content: `p-3.5`
- Use the sidebar's compact labels for metadata:
  - Label: `text-[10px] tracking-[0.04em] text-muted-foreground`
  - Body: `text-[12px] text-foreground`

### Page navigation tabs (adapted from sidebar nav item)

Use these for horizontal page tabs or filter pills:

```tsx
"h-8 px-3.5 border-y border-transparent bg-transparent hover:bg-sidebar-accent/30 hover:border-sidebar-border/50 active:bg-sidebar-accent/45";
```

Active tab:

```tsx
"bg-sidebar-accent/60 border-sidebar-border/80";
```

### Buttons and controls

- Keep geometry sharp: add `rounded-none` to primary controls.
- Secondary/utility buttons should mirror sidebar subtlety:
  - `variant="ghost"` + `hover:bg-sidebar-accent/45`
  - `variant="outline"` + `border-border/70 bg-background/60`
- Keep control heights compact:
  - Small: `h-7` / `h-8`
  - Icon: `h-6 w-6` or `h-7 w-7`

### Content rhythm (important for normal page readability)

- Use 3 vertical tiers:
  1. **Page title zone**: `mb-4`
  2. **Control/filter zone**: `mb-4`
  3. **Data/content zone**: `space-y-3` cards or panels
- Keep text sizes compact but avoid overusing `10px` in dense content blocks.
  - Use `10px` only for meta labels, not primary reading text.

## 12) Quick Page Preset (Copy/Paste)

```tsx
<main className="min-h-screen bg-background text-foreground">
  <header className="h-11 px-4 sm:px-6 lg:px-8 border-b border-sidebar-border/90 bg-sidebar/60 supports-backdrop-filter:backdrop-blur-xl flex items-center justify-between">
    <div>
      <h1 className="text-[13px] font-medium leading-none tracking-[0.01em]">
        Page Title
      </h1>
      <p className="text-[10px] text-muted-foreground mt-1">Page subtitle</p>
    </div>
  </header>

  <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 py-6 space-y-4">
    <section className="border border-border/70 bg-card/40 rounded-none">
      <div className="h-10 px-3.5 border-b border-sidebar-border/70 flex items-center justify-between">
        <span className="text-[10px] tracking-[0.04em] text-muted-foreground">
          SECTION
        </span>
      </div>
      <div className="p-3.5">
        <p className="text-[12px]">Your content here.</p>
      </div>
    </section>
  </div>
</main>
```

## 13) What to Keep vs What to Relax

- Keep: tokenized colors (`sidebar-*`, `border`, `muted`, `card`), sharp corners, compact heights, subtle hover/active opacities.
- Relax: fixed sidebar widths, overly tiny text in long-form content, icon-first interaction patterns.
- For normal pages, prioritize readability while preserving the same clean desktop aesthetic.
