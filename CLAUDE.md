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

**Entry flow:** `index.html` declares `<canvas id="canvas">` and loads `src/index.ts`, which starts the `Simulator` on it. CSS sizes the canvas to fill the viewport.

**Core classes:**

- **`Simulator`** (`src/lib/simulator.ts`) owns the `requestAnimationFrame` loop. Each frame it fits the canvas to its CSS size, draws the background, moves and wraps points, then visits each pair once (bounding-box check, then Euclidean distance) and strokes a line for every pair closer than `CONNECT_DISTANCE` before drawing the points on top. Line opacity is `1 - distance / CONNECT_DISTANCE`.
- **`Point`** (`src/lib/point.ts`) holds position, velocity, radius and color. `move(delta)` scales velocity by `delta`; `Point.create()` picks a uniform direction and a velocity spread evenly over a disk of radius `MAX_SPEED`.

Tunable parameters live in `src/lib/constants.ts`. Behavior that spans these files:

- `FPS` is not a frame cap. The loop runs at the display's rAF rate, and `delta` is elapsed time in units of `1000 / FPS` ms, so `MAX_SPEED` is pixels per reference frame. Raising `FPS` makes points drift faster.
- The wrap area is the canvas plus a `CONNECT_DISTANCE` margin on every side, so lines fade out before a point jumps to the other side. Wrapping is modular, so a huge `delta` after the tab was hidden doesn't pile points onto the boundary.
- Point count and spawn positions cover the whole wrap area, so the visible density matches `DENSITY`.
- `fit()` runs every frame and acts when the canvas's CSS size or `devicePixelRatio` changes. It sizes the backing store in device pixels and scales the context, so all simulation and drawing code works in CSS pixels. It also stretches existing points to the new size and adds or removes points to keep the density.

## Tech Stack

- TypeScript (strict mode, ES2023 target)
- Vite 8 (bundler/dev server, uses Rolldown), no `vite.config`, so Vite defaults apply
- No framework: direct Canvas 2D API, zero runtime dependencies
