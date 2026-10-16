# Phase 13 baseline: build time and package size

Taken 2026-09-29 on `2026-09-speed-enhancements` at `55375e7`, before any Phase 13 change, per the
[Phase 13 plan](../plan/phase-13-plan.md#before-changing-anything). Windows 11, Node 22, Yarn 3.5.0.
Uncommitted documentation edits (a separate de-branding pass) were present in the working tree; they touch only
Markdown, so they shift the tarball's byte count by a few bytes at most and nothing else.

## Build time

`yarn build` begins with `shx rm -rf lib`, which also deletes `lib/tsconfig.node.tsbuildinfo`, so **every**
`yarn build` is a full (non-incremental) compile; there is no separate cache to clear. Three consecutive runs:

| Run | Wall time | Notes |
| --- | --- | --- |
| 1 | 47.0 s | Truly cold: first build of the session, OS file cache cold |
| 2 | 16.6 s | OS caches warm |
| 3 | 18.5 s | OS caches warm |

The steady-state cost of `yarn build` is therefore about 17–19 s, all of it a full `tsc --build` plus
`genversion`, the `.mjs` copies and the doc copies.

## Watch mode

- `yarn build:watch` start, with a fresh `tsbuildinfo` present from a preceding `yarn build`: under 1 s to
  "Found 0 errors. Watching for file changes." (same-second timestamps; nothing to re-emit).
- One single-file touch (`src/version.ts`, timestamp only): **5.0 s** wall time from touch to
  "Found 0 errors." (tsc reported the incremental compile as 8:21:23 → 8:21:28).

## Package size

`yarn workspace @lynxwall/cucumber-tsflow pack` on the built tree:

| Measure | Value |
| --- | --- |
| Tarball | 295,628 bytes (288.7 KiB) |
| Files | 240 |
| Unpacked | 1,380,336 bytes (1.32 MiB) |
| of which `.js.map` | 667,030 bytes (651.4 KiB) across 71 files — 48% of the unpacked bytes |

Two files shipped that plainly should not, both excluded during this phase with negated `files` patterns
(`!lib/*.tsbuildinfo`, `!src/transpilers/esm/README.md` — the packer force-includes README files anywhere in the
tree, so the second exclusion has to name the file, not just `!src/`):

- `lib/tsconfig.node.tsbuildinfo` (2,450 bytes) — TypeScript's incremental-build state, useless to a consumer.
- `src/transpilers/esm/README.md` — contributor documentation for the authored loaders.

After the exclusions: **291,604 bytes, 238 files** (from 295,628 bytes, 240 files).

## What a consumer loads

Module count and on-disk bytes in `require.cache` after loading each CommonJS entry point from the built `lib/`
(Node 22, this repository's `node_modules`):

| Entry point | Modules | Bytes |
| --- | --- | --- |
| `lib/bindings.js` (what a step-definition file imports) | 225 | 1,470,951 |
| `lib/index.js` (the package root) | 528 | 2,951,795 |
| `lib/cli/index.js` (the CLI) | 513 | 3,167,230 |

The bindings entry point staying a fraction of the root import is the property to preserve: support files pay
for the decorators and the registry, not for the runtime. No change made here this phase; the numbers are the
reference for any future dependency or entry-point work.

## Install footprint

From the smoke test's fresh consumer projects (`npm install` of the packed tarball, no other dependencies):
229 packages installed, 83.4 MiB and 6,840 files of `node_modules`, identical for the CJS and ESM projects.
The tree is dominated by the bundled toolchain (`typescript`, `esbuild`, `jsdom`, `ts-node-maintained`), which
is the price of the package replacing `@cucumber/cucumber` and its transpilers outright rather than asking the
consumer to assemble them.

## Source maps: kept

`.js.map` files are 48% of the unpacked bytes, but they are what makes a consumer's stack traces point at
`src/*.ts` (`source-map-support` is a runtime dependency and the ESM loaders relay maps too). Dropping or
externalizing them would trade real debuggability for 651 KiB unpacked, on a package whose tarball is under
300 KB. Deliberately left alone.
