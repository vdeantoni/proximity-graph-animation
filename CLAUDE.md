# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

The package manager is pnpm (`pnpm-lock.yaml`).

- **Dev server:** `pnpm dev` (Vite, port 5173)
- **Build:** `pnpm build` (runs `tsc && vite build`; `tsc` only type-checks because `noEmit` is on)
- **Type-check only:** `pnpm exec tsc`
- **Preview production build:** `pnpm preview`
- **Format:** `pnpm dlx prettier --write src` (Prettier isn't a devDependency; `.prettierrc` sets single quotes and trailing commas)

No test runner or linter is configured, so `pnpm build` is the only automated check.

## Architecture

This is a vanilla TypeScript canvas animation that renders a proximity graph: points drift across a full-screen canvas and lines are drawn between points within a threshold distance, with opacity based on proximity.

**Entry flow:** `index.html` declares `<canvas id="canvas">` and the panel elements, then loads `src/index.ts`. It loads the saved settings, starts the `Simulator` on the canvas, and creates the control panel. CSS sizes the canvas to fill the viewport.

**Core modules:**

- **Settings** (`src/lib/settings.ts`) holds `DEFAULT_SETTINGS`, the slider `RANGES`, and localStorage load and save. The `Simulator` and the panel share one mutable settings object, and the simulator reads it every frame, so changes apply live. Loading clamps numbers to `RANGES` and drops wrong types and non-hex colors. Saving stores only values that differ from the defaults, and never `paused`.
- **`Simulator`** (`src/lib/simulator.ts`) owns the `requestAnimationFrame` loop. Each frame it fits the canvas, draws the background, moves and wraps points (unless paused), then draws connections and points on top. Connections use a grid of `connectDistance`-wide cells over the wrap area, so each point is only compared with points in its own and neighboring cells. Line opacity is `(1 - distance / connectDistance) ** fade`, rounded to `ALPHA_LEVELS` steps so all lines of one level go in a single `Path2D` and one `stroke()`. Opacity is applied with `globalAlpha` rather than `rgba()` strings, which are costly to parse per point. With triangles on, `fillTriangles()` fills triangles under the lines, shaded by their weakest or average edge level. The `mosaic` style takes the Delaunay triangulation (via `delaunator`) and keeps triangles whose edges are all connections: they never overlap and number at most two per point. The `overlapping` style fills every mutually connected triple, found from per-point `links` recorded during the connection pass (grid cells hold point indices for this); its count grows with the square of each point's neighbor count, so it gets slow when dense. Each triangle is filled on its own, because a single fill draws overlapping shapes once and batching made overlaps flicker. Per-triangle opacity lives in `fades`, keyed by the three point indices, and eases toward its target over `triangleTransition` ms, including fading out after an edge breaks.
- **`Point`** (`src/lib/point.ts`) holds position, a velocity inside the unit disk, and a `size` from 0 to 1. The simulator scales them by `maxSpeed` and the radius range at draw time, so those settings apply to existing points.
- **Panel** (`src/panel.ts`) builds the Tweakpane controls, hidden until the toggle button or the `h` key opens them. It saves settings on each finished change, skipping the FPS monitor, which emits `change` on every poll.

Behavior that spans these files:

- `FPS` in `settings.ts` is not a frame cap. The loop runs at the display's rAF rate, and `delta` is elapsed time in units of `1000 / FPS` ms, so `maxSpeed` is pixels per reference frame.
- The wrap area is the canvas plus a `connectDistance` margin on every side, so lines fade out before a point jumps to the other side. Wrapping is modular, so a huge `delta` after the tab was hidden doesn't pile points onto the boundary.
- Point count and spawn positions cover the whole wrap area, so the visible density matches `density`.
- `fit()` runs every frame and acts when the canvas's CSS size, `devicePixelRatio`, `connectDistance` or `density` changes. On a size change it sizes the backing store in device pixels and scales the context, so all simulation and drawing code works in CSS pixels. It then stretches existing points to the new wrap area, rebuilds the grid, and adds or removes points to keep the density.

## Tech Stack

- TypeScript (strict mode, ES2023 target)
- Vite 8 (bundler/dev server, uses Rolldown), no `vite.config`, so Vite defaults apply
- No framework: direct Canvas 2D API
- Runtime dependencies: Tweakpane 4 for the control panel, and `delaunator` for the mosaic triangles. Tweakpane's type declarations import `@tweakpane/core`, so that devDependency is required for `tsc` even though nothing imports it directly.
