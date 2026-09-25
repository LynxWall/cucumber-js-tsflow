# Phase 3 hand-off

Part of the [Performance Enhancement Execution Strategy](../performance-enhancement-execution-strategy.md).

Written at the end of the Phase 3 session so that the Phase 4 session can start cold.

## State of the tree

- Still on branch `2026-09-performance-enhancements`. Phase 2 was committed as `8f0a161` ("MessageCollector
  updates + Map additions"). At the time of writing the Phase 3 changes were **uncommitted, pending code
  review**; check `git log` and `git status` before assuming either way.
- `yarn build` clean, no stray `.js` under `src/`; `yarn test:all` green on all sixteen variants; Prettier
  and ESLint clean on every changed `.mjs` file. No `.ts` source changed, so `tsc --noEmit` is unaffected.
- Files changed: `src/transpilers/esm/loader-utils.mjs`, `src/transpilers/esm/esbuild.mjs`,
  `src/transpilers/esm/tsnode-loader.mjs`, `src/transpilers/esm/tsnode-service.mjs`,
  `src/transpilers/esm/vue-loader.mjs`, `src/transpilers/esm/README.md`, plus `CHANGELOG.md` and a new
  "ESM loader caches" subsection in `Architecture.md`.
- The UIS Tools VueApp was already linked to this checkout (`link:` devDependency, see the
  `pnpm-link-consumer` skill) when the session started; nothing about the link was changed.

## What Phase 3 landed

- **Item 3.** The two `ts-node` services tsflow creates (`tsnode-loader.mjs` for `ts-node-esm`,
  `tsnode-service.mjs` for `es-node-esm` and `es-vue-esm`) now pass `files: false` rather than merely
  dropping `files: true`. The reason is precedence: ts-node resolves `files` as API option → tsconfig
  `ts-node.files` → `TS_NODE_FILES`, and every spec workspace tsconfig (and the ESM README's recommended
  tsconfig) sets `ts-node.files: true`, so a plain removal would have left the walk in place for exactly the
  consumers who followed the docs. `files: false` is safe because `transpileOnly: true` is forced in the same
  option object and the walk's only consumer, `config.fileNames` at `ts-node-maintained/dist/index.js:368`,
  is inside `if (!transpileOnly)` — re-verified against the installed 10.9.x this session.
  The two `process.env.TS_NODE_FILES` assignments were deleted as dead code: both ran after
  `ts-node-maintained` had already been required at module init (`tsnode-service.mjs` requires it at top
  level and `loader-utils.mjs` imports `tsnode-service.mjs`), and ts-node reads its env defaults once at
  require time. `ts-vue-esm` (`vue-loader.mjs` → `ts-node-maintained/esm`) takes no API options, does not
  force `transpileOnly`, and may legitimately type-check `.vue` shims, so it is left governed by the
  consumer's tsconfig; the README says so.
- **Item 6.** `esbuild.mjs` compiles `{ searchPattern, replacementPath, regex }` per alias once inside
  `loadTsConfigPaths()` (stored as `tsconfigCache.mappings`); `tsnode-loader.mjs` builds the equivalent
  module-level `pathMappings` array. The `searchRegex.test(code)` pre-scan in `tsnode-loader` is gone; the
  single `replace` pass detects and rewrites, and `replacementCount > 0` replaces the old `modified` flag.
  Reusing a `g`-flagged `RegExp` with `String.prototype.replace` is safe because `@@replace` resets
  `lastIndex` to 0 for global regexes; the `.test()` call was the only thing that made reuse hazardous.
- **Item 7.** `resolveWithExtensions` caches in `extensionResolutionCache`, keyed on the resolved absolute
  extensionless path (plus the extension list when a non-default one is passed — no caller does today)
  rather than on `specifier + parentURL`. That key is strictly better: `../fixtures/x` from ten files in one
  directory and `@fixtures/x` mapped to the same location all share one set of probes. Negative results are
  cached. Lifetime is the process; `clearResolutionCaches()` is exported and clears both this and
  `pathResolutionCache`, which is the documented hook item 23's watch mode needs. `resolveSpecifier` gained
  a `getTsNodeHooks` thunk option alongside the existing `tsNodeHooks` value; `createEsbuildLoader` passes
  the thunk, so ts-node service construction happens on the first `.ts`/`.tsx` specifier or load, not on
  the first `resolve` of any specifier. `tsnode-loader.mjs` still passes its eager `esmHooks` value.

## Measured effect on the large suite

UIS Tools `dim` profile (324 scenarios, 1363 steps, `es-vue-esm`, experimental decorators, serial),
`TSFLOW_TIMING=true`, same machine and session. This time the comparison is a true A/B: the Phase 3 build was
run three times, then the five loader files were stashed, `lib/` rebuilt from the Phase 2 loaders, that
build run three times, and the Phase 3 tree restored and rebuilt. Both builds produced the same five
`nwsapi` selector failures as in Phase 2. Run 1 of the Phase 3 set was the first run after a `yarn build`
and is shown only to make the cold-cache effect visible; the baseline set ran with a warm cache throughout
because its `yarn build` was preceded by the Phase 3 runs over the same dependency tree.

| Build              | Run | `support:import` ms | `esm:resolve` ms (2828 calls) | `esm:load` ms (921 files) | `esm:hooks-init` ms | `bootstrap` ms | Wall  |
| ------------------ | --- | ------------------- | ----------------------------- | ------------------------- | ------------------- | -------------- | ----- |
| Phase 2 loaders    | 1   | 25383               | 1128                          | 1308                      | 158                 | 468            | 73 s  |
| Phase 2 loaders    | 2   | 25351               | 1079                          | 1329                      | 142                 | 452            | 71 s  |
| Phase 2 loaders    | 3   | 24089               | 986                           | 1190                      | 142                 | 475            | 71 s  |
| Phase 3 (cold)     | 1   | 88829               | 4134                          | 29235                     | 860                 | 688            | 138 s |
| Phase 3            | 2   | 23533               | 973                           | 1186                      | 141                 | 516            | 71 s  |
| Phase 3            | 3   | 23859               | 997                           | 1192                      | 128                 | 467            | 75 s  |

`runtime:run` was 39.1–40.7 s on every warm run of both builds and is omitted.

Three conclusions:

1. **Phase 3 is worth about a second on this suite, not the tens of seconds the ratings implied.**
   Warm `support:import` moved from 24.1–25.4 s to 23.5–23.9 s, `esm:resolve` from 0.99–1.13 s to
   0.97–1.00 s, and `esm:hooks-init` from 142–158 ms to 128–141 ms. All three are real and in the expected
   direction, and all three are small. The extension cache (item 7) cannot save much when a warm OS file
   cache answers `existsSync` in microseconds; the win it was rated for is a cold-cache or network-drive
   win. The path-mapping regexes (item 6) are a handful of aliases here. The `files: false` change (item 3)
   could not show up on this testbed at all: the UIS `test/tsconfig.json` has no `ts-node` block, so
   `files` was already unset and no `include` walk was being paid. Item 3 pays off only for consumers whose
   tsconfig sets `ts-node.files: true`, which is what every spec workspace and the ESM README's
   recommended tsconfig do; measuring it needs such a consumer, and the `include` set's size decides the
   prize.
1. **The Phase 2 hand-off's `esm:resolve` 5 s and `esm:load` 35 s figures were cold-cache artifacts.**
   The same Phase 2 loaders, warm, measure 1.0 s and 1.3 s. The Phase 3 cold run reproduces the shape
   exactly (4.1 s and 29.2 s), so those numbers describe the first run after `yarn build` rewrote `lib/`
   and nothing about the code. This also corrects the "Notes specific to Phase 3" bullet above that said
   the time "actually is" in `esm:load`; on a warm run it is in `evaluate` (module execution, 24–26 s of
   the 24–25 s `support:import`), which no loader-level change can touch.
1. **`esm:load` is a sum over concurrent hook invocations, not elapsed time.** Node loads sibling imports
   concurrently, so summed `load` durations can exceed the phase that contains them (29 s inside an 89 s
   import is fine; on Phase 2's record 35 s inside a 26 s import was the giveaway). Compare it across
   builds, never against wall clock.

Working backwards from these figures, the remaining startup cost on this suite is module evaluation of
~200 support files plus their dependency graph (`evaluate` 24–26 s) and the 0.5 s `bootstrap`. Of the
Phase 4 items, 8 (lazy callsites at decorator time) and 20 (a smaller import graph) act on `evaluate`; 14
acts on both. Item 16's transpile cache does not help a warm run of this profile at all — `transpile ms`
is under 1 s of the 24 s — and its rating should be reread with that in mind before Phase 6 is scoped.

_Corrected by Phase 4:_ the "module evaluation" reading of `evaluate` was wrong. About 20 s of the 24–26 s
was `source-map-support` resolving decorator callsites, one synchronous jsdom `XMLHttpRequest` (a spawned
process) per support file. Genuine module evaluation of this profile is about 4 s. See the Phase 4 hand-off.

## Notes specific to Phase 4

- Phase 4 (items 8, 10, 14, 20) is the first phase to touch `.ts` files again after two phases in
  `src/runtime`, `src/bindings` and `.mjs` loaders, and the first to touch the package `exports` map and the
  coordinator-to-child IPC contract. The Phase 1 timing plumbing was not changed in Phase 3, so `esm:*`
  phases and the file tables remain directly comparable across all three phases.
- Item 8 (lazy callsites) shows up in the `evaluate`/`import` file columns and `support:import`, item 10
  (no child re-glob) in per-`worker:<id>` `config`/startup, item 14 (`enableCompileCache`) in `bootstrap`
  across every context, item 20 (barrel slimming) in `bootstrap` and the first-file `evaluate` outlier.
- The `dim` profile is serial (`parallel` unset), so item 10 cannot be measured on it; the UIS `test`
  profile or a spec workspace with `parallel: 2` is needed for that one.
- Take at least three runs per build and discard run one after any `yarn build` or `pnpm install`; the
  Phase 2 hand-off explains why (cold filesystem cache plus on-access antivirus on this Windows machine).
