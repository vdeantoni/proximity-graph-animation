# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Dev server:** `pnpm dev` (Vite dev server)
- **Build:** `pnpm build` (runs `tsc && vite build`)
- **Preview production build:** `pnpm preview`

No test runner or linter is configured. Use Prettier for formatting (config in `.prettierrc`: single quotes, trailing commas).

## Architecture

This is a vanilla TypeScript canvas animation that renders a proximity graph — points drift across a full-screen canvas and lines are drawn between points within a threshold distance, with opacity based on proximity.

**Entry flow:** `index.html` loads `src/index.ts`, which creates a full-viewport `<canvas>` and starts the `Simulator`.

**Core classes:**

- **`Simulator`** (`src/lib/simulator.ts`) — Owns the animation loop (`requestAnimationFrame`), manages the point population, handles wrapping points at canvas edges, computes pairwise connections within `CONNECT_DISTANCE`, and renders everything. Connection detection uses a bounding-box pre-filter before computing Euclidean distance.
- **`Point`** (`src/lib/point.ts`) — Represents a particle with position, velocity, radius, and color. Has `move(delta)` for frame-rate-independent movement and `distance(other)` for Euclidean distance. Factory method `Point.create()` randomizes initial state.

**Constants** (`src/lib/constants.ts`) — Tunable parameters: `FPS`, `DENSITY`, `MAX_SPEED`, `MIN_RADIUS`, `MAX_RADIUS`, `CONNECT_DISTANCE`.

## Tech Stack

- TypeScript (strict mode, ES2023 target)
- Vite 8 (bundler/dev server, uses Rolldown)
- No framework — direct Canvas 2D API, zero runtime dependencies
