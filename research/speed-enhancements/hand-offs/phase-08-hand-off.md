# Phase 8 hand-off

Part of the [Performance Enhancement Execution Strategy](../performance-enhancement-execution-strategy.md).

Written at the end of the Phase 8 session (2026-09-17) so that Phase 9 can start cold. Phase 8 landed item
16, the content-addressed on-disk transpile cache, behind `--no-transpile-cache`. Items 15 and 17 were
gated on the `parallelLoad` / `origin/Dev-Prebuild` decision when this was first written; the decision was
measured and taken later the same day — see [`parallelLoad` A/B on `dim`](#parallelload-ab-on-dim-2026-09-17-after-phase-8)
and [`parallelLoad` removal](#parallelload-removal-2026-09-17) below — and both items are dropped.

## State of the tree

- Still on branch `2026-09-performance-enhancements`; Phase 7 ended at `ed5bbbf` with its own files
  uncommitted, and at the time of writing everything from Phase 7 and Phase 8 was **uncommitted**: this
  hand-off and the Phase 7 hand-off, `research/scripts/attribute-cpuprofile.js`, the "Profiling a run"
  section of `research/local-consumer-testing.md`, the `.gitignore` rule for `research/profiles/`, and the
  Phase 8 source and documentation changes listed below. Check `git status` before assuming.
- `yarn build` clean, no stray `.js` under `src/`; `yarn test:all` green on all sixteen variants on the
  Phase 8 build; ESLint and Prettier clean on every touched file. The cache was exercised by the matrix
  itself: every spec profile has `parallelLoad: true`, so the preload threads populated it and the main
  thread read it in every variant.
- Files changed: new `src/transpilers/transpile-cache.ts`; `src/transpilers/esbuild.ts`,
  `src/transpilers/esm/esbuild.mjs` and `src/transpilers/vue-sfc-compiler.ts` (each transpile entry point
  wrapped in `withTranspileCache`); `src/cli/argv-parser.ts` (`transpileCache` option,
  `--transpile-cache` / `--no-transpile-cache`); `src/api/load-configuration.ts` (default and the
  `TSFLOW_TRANSPILE_CACHE` environment transport); `src/api/run-cucumber.ts` (load-phase summary and the
  prune call). Docs: `README.md` (option table row, new "Transpile cache" section), `Architecture.md`
  (Core Components entry, new "Transpile cache" subsection, a sentence under Parallel Preload),
  `CHANGELOG.md` (one `Added` entry).
- The UIS Tools VueApp link is unchanged and must not be committed there. Its cache is at
  `Tools.Web/VueApp/test/node_modules/.cache/cucumber-tsflow/transpile` — the `test` directory is its own
  pnpm workspace package with its own `node_modules`, which is the nearest one above the working directory —
  974 entries, 16 MB, for the `default` profile. `research/profiles/p8-*` holds the Phase 8 console logs
  (and, for the first series, CPU profiles), gitignored.

## What Phase 8 landed

- **Scope decision: the cache covers the Vue SFC compile as well as esbuild.** The Phase 7 notes priced the
  two halves at 1.5 s and 1.25 s of the full suite's 2.8 s transpile total, so caching esbuild alone would
  have left almost half on the table. `compileVueSFC` is wrapped at its own level, which covers every Vue
  transpiler in one place: `es-vue` and `ts-vue`/`ts-vue-exp` (`require-extension-hooks`), and `es-vue-esm`
  and `ts-vue-esm` (`loadVue` in `loader-utils.mjs`, which still runs its `transformImports` regex pass over
  the cached output; that pass was never in the transpile figures). esbuild is wrapped in both
  `transpileCode` functions: `esbuild.ts` (CJS, reached through ts-node's `Transpiler` plugin for `es-node`
  and `es-vue`) and `esm/esbuild.mjs` (the in-thread `load` hook for `es-node-esm` and `es-vue-esm`). Not
  covered, deliberately: ts-node's own TypeScript output for `ts-node`, `ts-vue`, `ts-node-esm` and
  `ts-vue-esm`; it is produced inside ts-node's service, not by a tsflow call.
- **One CJS module, three callers.** `esm/esbuild.mjs` loads `lib/transpilers/transpile-cache.js` through
  `createRequire`, the pattern `esm/vue-sfc-compiler.mjs` already used, so within a thread all three entry
  points share one module instance and one set of counters, and there is no `.mjs` twin to keep in step.
- **The key** is a SHA-256 over: entry format version, tsflow version, caller `kind` (`esbuild-cjs`,
  `esbuild-esm`, `vue-sfc`), the caller's serialized configuration, the absolute file name, and the source
  text. The configuration carries the full esbuild `TransformOptions` (so `tsconfigRaw`, hence the decorator
  mode, and `sourcemap`) and the esbuild version; for `esbuild-esm` additionally the tsconfig
  `absoluteBaseUrl` and `paths` that `rewritePathMappings` bakes into the output as `file://` URLs — the
  analysis-3 portability point, honored by making entries non-portable rather than by trying to make the
  output portable; for `vue-sfc` the style flag, output format, decorator mode and the consumer's `vue`
  version (`require('vue/package.json')`, `'unknown'` if unresolvable). The file name is in the key because
  esbuild names it in the source map and the Vue compiler derives the component id from it. Nothing is keyed
  on path or mtime alone. One known gap: whether a `<style lang="scss">` block compiles or is skipped depends
  on a preprocessor being installed, and that is not in the key; installing sass after a component was
  cached keeps the skip until the source, the `vue` version or the tsflow version changes.
- **Storage** is one JSON file per entry (`{ v, value }`, `value` being `{ output, sourceMap }` or
  `{ code }`), named by the key, in `TSFLOW_TRANSPILE_CACHE_DIR` or `.cache/cucumber-tsflow/transpile` under
  the nearest `node_modules` at or above the cwd (falling back to the nearest `package.json`'s directory,
  then the OS temp dir). Reads are one `readFileSync` plus `JSON.parse`; ENOENT is the miss path. Writes go
  to `<entry>.<pid>-<threadId>.tmp` then `renameSync`, so the N+1 contexts racing on an empty cache never
  see a partial entry and the last identical writer wins; any write failure (read-only location, a
  concurrent reader holding the target open on Windows) is swallowed and the transpile result still
  returned. An unparseable entry is deleted and treated as a miss. The cache can change whether a
  transpile runs, never what it returns.
- **Eviction**: `pruneTranspileCache()` is called once by `runCucumber` after the load phase and does
  nothing unless this process wrote entries, so a warm run never lists the directory. When it does run it
  stats every file, and if the total exceeds 512 MB deletes least-recently-written first until it fits —
  the garbage in a content-addressed store is exactly the entries no current source produces, and they
  are the oldest. 15 ms on the 200-entry `dim` cache, 75 ms on 974 entries.
- **Switch**: `transpileCache` (default true) in configuration, `--transpile-cache` /
  `--no-transpile-cache` on the CLI (both forms declared, like `--strict`/`--no-strict`, so commander does
  not inject a default that would override a profile). `loadConfiguration` writes the resolved value to
  `TSFLOW_TRANSPILE_CACHE`, which is what the transpilers read — that is the only transport that reaches the
  ESM hooks thread under `module.register()`, preload threads and parallel children alike, the same route
  `CUCUMBER_EXPERIMENTAL_DECORATORS` takes. An environment value already present is honored as the default
  when the option is unset, so CI can disable it without touching configuration.
- **Visibility**: the load-phase progress line ends with `N of M transpiles from the cache` (main-process
  counters), and the timing report gains `transpile-cache:hit` / `transpile-cache:miss` phases whose
  `calls` column is the count and whose `ms` is the lookup time (hit) or lookup plus transpile plus write
  (miss), plus `transpile-cache:prune`. A hit still records a `transpile` file entry for its lookup time so
  the `files` column and the slowest-files table keep the same population between cold and warm runs.
- **Bootstrap notice (item 26, developer experience; owner's request after trying the build).** The first
  run of the Phase 8 build on the owner's machine, while screen-recording, sat visibly long between the
  `cucumber-tsflow -p default` command and `Loading configuration` — the `bootstrap` phase, Node loading the
  library's several hundred modules, during which nothing of tsflow's has run and nothing was printed.
  `bin/cucumber-tsflow.js` now prints one line before requiring the library (requiring `ansis` on its own
  for the color) and `lib/cli/run.ts` prints `cucumber-tsflow loaded in N ms.` on entry
  (`performance.now()`, the `bootstrap` figure), gated by a `globalThis.__CUCUMBER_TSFLOW_BOOTSTRAP_ANNOUNCED`
  flag so programmatic callers never see it. Both in `ansis.dim`, the phase-detail gray, at the owner's
  request; no spinner and no theme, by the owner's choice: two lines that are superfluous at the usual 0.4 s and the point when
  it is 29 s (the first run after a `yarn build`, when Node's compile cache is rebuilt for the changed
  files — observed on the spec workspace today, 390–399 ms on the two runs after). Skipped for
  `--version`, `--help`, `--i18n-*` and under `TSFLOW_THEME=off`, so the measurement recipe's output is
  unchanged. Documented in README (Startup progress), Architecture (CLI) and the CHANGELOG.
- **The preload phase now does what its documentation claimed.** With `parallelLoad: true` the worker
  threads' misses write the entries the main thread then reads: on the `node` spec workspace's cold cache,
  four preload threads recorded 80 misses and the main thread 19 hits of 19. That is most of item 17's
  stated payoff without item 17's reshaping; what 17 would still buy is dropping module evaluation (and the
  160-line `window` shim) from the workers.

## Measured effect on the large suite

UIS Tools VueApp, `es-vue-esm`, experimental decorators, serial, `TSFLOW_TIMING=true`, `TSFLOW_THEME=off`, one
build (`7.7.2` plus Phase 8), one machine, one session, back to back. This is a true A/B on the build: **warm**
rows run with the cache populated by an earlier run, **off** rows pass `--no-transpile-cache` (the pre-Phase 8
code path: `withTranspileCache` returns `produce()` without touching the disk), **cold** is the first run with an
empty cache. The first series (`dim` 1–5, `default` 1–4) ran under `node --cpu-prof` per the Phase 7 recipe; the
second (`dim` 6–9, `default` 5–7) without profiling and with a 45 s pause before each run. `transpile ms` is the
per-file total from the file-totals table (on a warm run it is the cache lookup time, since a hit records a
`transpile` entry); `hits`/`misses` are the `transpile-cache:*` `calls`. The machine carried the owner's own
load throughout (an editor, Teams, Zoom, Spotify at 40–60% CPU between runs), so disturbed runs are shown struck
through by note rather than hidden and excluded from the conclusions: the criterion is `bootstrap` over a second
or a startup row more than double its neighbors with a normal `runtime:run`.

`dim` (334 scenarios, 200 files through the hooks):

| Run | Cache | `bootstrap` ms | `esm:resolve` ms | `esm:load` ms | `transpile ms` | hits / misses | `support:import` ms | `runtime:run` ms | Note |
| --- | ----- | -------------- | ---------------- | ------------- | -------------- | ------------- | ------------------- | ---------------- | ---- |
| 1 | cold | 524 | 1388 | 2185 | 1220 | 0 / 200 | 5655 | 54 s | profiled; first run, discard |
| 2 | warm | 422 | 627 | **270** | **44** | 200 / 0 | **2175** | 40 s | profiled |
| 3 | off | 434 | 905 | 1296 | 987 | — | 3682 | 101 s | profiled; runtime disturbed, startup mildly |
| 4 | warm | 22021 | 4651 | 25316 | 3476 | 200 / 0 | 88600 | — | disturbed throughout; discarded |
| 5 | off | 913 | 2539 | 3812 | 3015 | — | 10641 | — | disturbed throughout; discarded |
| 6 | warm | 452 | 621 | **259** | **42** | 200 / 0 | **2267** | 39.0 s | |
| 7 | off | 398 | 631 | 929 | 702 | — | **2888** | 38.3 s | |
| 8 | warm | 527 | 657 | **280** | **49** | 200 / 0 | **2497** | 37.9 s | |
| 9 | off | 442 | 672 | 946 | 702 | — | **3004** | 38.3 s | |

`default` (1571 scenarios, 974 files through the hooks, 2578 `load` and 9632 `resolve` calls):

| Run | Cache | `bootstrap` ms | `esm:resolve` ms | `esm:load` ms | `transpile ms` | hits / misses | `support:import` ms | `runtime:run` ms | Note |
| --- | ----- | -------------- | ---------------- | ------------- | -------------- | ------------- | ------------------- | ---------------- | ---- |
| 1 | cold | 900 | 6514 | 44073 | 6118 | 200 / 774 | 76665 | 689 s | profiled; disturbed throughout (3× runtime, four 5 s step timeouts); discarded |
| 2 | warm | 20339 | 7899 | 68045 | 17719 | 974 / 0 | 154026 | 492 s | profiled; disturbed throughout (same four timeouts); discarded |
| 3 | off | 454 | 4764 | 7745 | 5996 | — | 17152 | 218 s | profiled; startup disturbed (every row 2× run 6), runtime normal; startup discarded |
| 4 | warm | 432 | 2084 | **1106** | **311** | 974 / 0 | **5519** | 214 s | profiled; clean, all 1571 passed |
| 5 | warm | 426 | 1748 | **927** | **254** | 974 / 0 | **5116** | 196 s | clean |
| 6 | off | 435 | 1586 | 3054 | 2394 | — | **6692** | 188 s | clean |
| 7 | off | 403 | 1717 | 3337 | 2531 | — | **7237** | 193 s | clean |

Conclusions:

1. **On the full suite the cache removes 2.1–2.4 s of `esm:load` and 1.2–2.1 s of `support:import` from a
   warm startup.** Clean pairs: `esm:load` 3.05–3.34 s off against 0.93–1.11 s warm, `transpile ms` 2.39–2.53 s
   against 0.25–0.31 s (974 lookups, 0.26–0.32 ms each, one `readFileSync` and a `JSON.parse` of a 16 KB
   average entry), `support:import` 6.7–7.2 s against 5.1–5.5 s. The transpile saving is what Phase 7 predicted
   (2.4–2.5 s measured here against the 2.86 s Phase 7 saw under the profiler); the wider `support:import`
   spread is module evaluation's own run-to-run variance, 0.4–0.5 s between two runs of the same mode.
1. **On `dim` it is 0.6–0.7 s of a 2.9–3.0 s startup, about 22%.** `esm:load` 0.93–0.95 s off against
   0.26–0.28 s warm, `transpile ms` 0.70 s against 0.04–0.05 s, `support:import` 2.89–3.00 s against
   2.27–2.50 s, over two interleaved pairs (6/7 and 8/9) whose `runtime:run` agreed to within 1.1 s.
1. **What remains of startup is Node.** Warm, the full suite's `support:import` is 5.1–5.5 s of which the hooks
   account for 2.7–3.2 s (`esm:resolve` 1.7–2.1 s over 9632 calls — the extension probing and tsconfig `paths`
   lookups, cached per path since Phase 3 — plus `esm:load` 0.9–1.1 s, of which the transpile lookups are
   0.25–0.31 s and the rest is reading 974 sources and returning them) and module evaluation the balance. That
   is the number Phase 9's item 24 is priced against.
1. **Cold runs are unchanged in kind and slightly dearer in degree:** the miss path is the old transpile plus a
   `JSON.stringify` and two file operations, 1.7 s over 200 misses on the clean `dim` cold run against 1.0 s of
   transpile — about 3.5 ms per entry written, paid once per source change.
1. **Nothing changed in the runtime,** as expected: `runtime:run` 188–218 s across the clean full-suite runs and
   37.9–39.0 s across the clean `dim` runs, warm and off interleaved, with every scenario passing in every
   clean run. The four timeouts in `default` runs 1 and 2 were in `features/dim/suites/tests-in-suite.feature`,
   whose scenarios passed in all nine `dim` runs with the same cache entries and in `default` runs 3–6; they
   were the machine.

## `parallelLoad` A/B on `dim` (2026-09-17, after Phase 8)

The owner leaned towards removing `parallelLoad` (the `origin/Dev-Prebuild` outcome) but asked for the
measurement first. Same build, same machine, same session as the Phase 8 series, `dim` profile, serial,
`TSFLOW_TIMING=true`, `TSFLOW_THEME=off`, the cache pointed at a scratch directory through
`TSFLOW_TRANSPILE_CACHE_DIR` so the consumer's own cache was untouched; **cold** rows start from an empty
directory, **warm** rows reuse the previous run's 200 entries. `--parallel-load` on the command line gives
four preload threads (`min(availableParallelism(), 4)` on a 14-core machine). A discarded warm-up run
absorbed the first-run-after-`yarn build` compile-cache rebuild; 45 s pause between runs. Logs in
`research/profiles/p8b-preload-ab/` (gitignored). `startup` is the report header's "ms since process start"
less `runtime:run`, so it includes bootstrap, preload, load, assemble and launch.

| Run | Preload | Cache | `preload` ms | main `esm:load` ms | main transpile-cache | main `support:import` ms | startup ms | Note |
| --- | ------- | ----- | ------------ | ------------------ | -------------------- | ------------------------ | ---------- | ---- |
| 1 | off | cold | — | 1671 | 200 miss | 4283 | **5624** | |
| 2 | off | warm | — | 294 | 200 hit | 2436 | **3580** | |
| 3 | on | cold | 5841 | 298 | 200 hit | 2463 | **9686** | |
| 4 | on | warm | 5919 | 266 | 200 hit | 2451 | **10007** | |
| 5 | off | cold | — | 33555 | 200 miss | 114509 | — | `bootstrap` 31 s; disturbed throughout, discarded |
| 6 | on | cold | 6024 | 272 | 200 hit | 2343 | **9553** | |
| 7 | off | warm | — | 331 | 200 hit | 2595 | **3795** | |
| 8 | on | warm | 5132 | 275 | 200 hit | 2378 | **8710** | |

Inside the preload phase (four threads, per-thread figures are wall time on that thread, running
concurrently): each worker's `support:import` was 4.4–5.5 s, of which `esm:resolve` 1.2–1.3 s over about
2270 calls per thread and `esm:load` 0.4–1.3 s; the workers' transpile total across all four was
2.6–2.7 s cold (about 200 misses plus about 250 hits on entries a sibling thread had just written) and
0.2 s warm. The rest, some 3 s per thread, is module evaluation: every worker imports jsdom through
`vue-jsdom-setup.mjs` and evaluates its share of the 200 files with their dependency graphs, work that
is discarded with the thread. Runtime figures are omitted: the UIS checkout had been fast-forwarded that
morning and its `node_modules` held both `vue@3.5.17` and `vue@3.5.18`, so 202 of 334 scenarios failed
in every run, preload on or off, with `Cannot read properties of null (reading 'ce')` in `renderSlot`
across the two runtime-core copies. That was the consumer's state, not this build's, and it did not touch startup,
which completes before the first scenario. Cause: the pull had moved the workspace from pnpm 10 to pnpm 11, and the
first install under pnpm 11 re-pointed the hidden hoist link `node_modules/.pnpm/node_modules/vue` at 3.5.18, which
is what `@vue/test-utils`, `@uis/testing-bdd` and `primevue` resolve `vue` through (they have no peer link of their
own) while the components link to 3.5.17. A clean reinstall (`npkill` then `pnpm install`) resolved it and the full
UIS suite passed again on this build.

Conclusions:

1. **Preload makes every run slower, cold and warm.** Cold: 9.6–9.7 s startup with preload against 5.6 s
   without. Warm: 8.7–10.0 s against 3.6–3.8 s. The phase costs 5.1–6.0 s and the most it can save is
   the cold main-thread transpile, 1.8 s here (`support:import` 4.28 s cold against 2.46 s behind a
   preload-warmed cache). It never comes close to paying for itself.
1. **The cost is module evaluation, not transpilation, and evaluation cannot be moved off the main
   thread.** Even on a warm cache each worker spends 4.4–4.9 s evaluating a module graph the main thread
   then evaluates again. Item 17's transpile-only workers would remove that, but the whole transpile
   saving on offer is 1.8 s cold and nothing warm, against thread startup, a ts-node service, an esbuild
   service and a Go child per thread.
1. **The data supports removal** (position 1 in the session discussion: delete the preload, keep the
   cache). Items 15 and 17 lose their subject with it, and the `preload` progress phase, the `PROGRESS`
   message, the `SerializableBindingDescriptor` transfer, the `__LOADER_WORKER` decorator branch and the
   `window` shim in `loader-worker.ts` go with them. `origin/Dev-Prebuild`'s removal commit (`be86c28`,
   717 deletions across 20 files) is the shape of the change, but it is two commits off an April master
   and `loader-worker.ts` has changed underneath it, so the deletion is redone on this branch rather than
   merged. Every spec profile sets `parallelLoad: true`, so the option needs a documented fate for
   existing consumers (ignored with a deprecation notice, or removed from the option table and rejected).

## `parallelLoad` removal (2026-09-17)

Taken on the A/B above, in the same session. The owner chose position 1 — delete the preload, keep the cache — and
asked that existing configurations keep working, so:

- Deleted `src/api/loader-worker.ts` (with its 160-line browser `window` shim) and `src/api/parallel-loader.ts`; the
  preload block in `run-cucumber.ts` and `load-support.ts`; the `__LOADER_WORKER` branch in `binding-decorator.ts` and
  the global declaration; `SerializableBindingDescriptor` / `serializeBinding` and `BindingRegistry.toDescriptors()` /
  `getDescriptorSourceFiles()`; the `preload` phase in `StartupPhaseId` and both themes (`Making the brine`, `Stoking
  the forges of Isengard`); and the `preload:<n>` section and family-table row of the `TSFLOW_TIMING` report.
  `mergeTimingSnapshot` stays for the parallel children. The compiled `lib/api/loader-worker.*` and
  `parallel-loader.*` had to be deleted by hand: `tsc --build` does not remove outputs of deleted sources.
- `parallelLoad` remains in every public type as an optional `@deprecated` field (`ITsflowConfiguration`,
  `IConfigurationExt`, `ITsFlowRunOptionsRuntime`, `TsFlowRuntimeOptions`, `ITsFlowLoadSupportOptions`) and
  `--parallel-load [THREADS]` is still parsed, as a hidden commander `Option` whose parser returns `true`. Nothing
  reads the value except `loadConfiguration`, which, when it is truthy, prints the notice below to stdout through the
  same `Console` as `Loading configuration from …`: a blank line, ten stars, a blank line, then
  `DEPRECATION NOTICE:` (bold) and three sentences ending in what to remove — `"parallelLoad" from "<config file>"`
  when it came from the file, `the --parallel-load flag from the command line` when `options.provided` carried it.
  An explicit `parallelLoad: false` is silently ignored. Verified for both sources and for the silent case from a
  scratch directory; `--help` no longer lists the flag.
- All eight spec profiles lost their `parallelLoad` keys (the matrix printed no notice). README (both copies),
  Architecture, CLAUDE.md and the changelog (`Deprecated` and `Removed` entries under Unreleased) updated; the
  historical 7.7.0 release notes in the README were left as written.
- Versioning: the branch stays a **minor** release. The option is accepted and ignored, the flag still parses, every
  programmatic type still compiles, and the changelog says the field goes in the next major — the
  deprecate-in-minor, remove-in-major pattern. `yarn build` clean, no stray `.js` under `src/`, `yarn test:all` green
  on all sixteen variants.
## Re-rating after Phase 8

| #   | Change | I/C after Phase 7 | I/C now | Why |
| --- | --- | --- | --- | --- |
| 16  | Content-addressed on-disk transpile cache | 4 / 7 | done | Landed and measured; see above. |
| 15  | Preload thread count from `availableParallelism()` | 3 / 3 | dropped | The preload was removed after the A/B below; there is no thread count to derive. |
| 17  | Reshape `parallelPreload` to transpile into the cache | 6 / 7 | dropped | The A/B below showed the whole saving on offer was 1.8 s, cold only, against a 5–6 s phase; the owner removed the preload rather than rebuild it. The cache delivers the durable half of what 17 promised. |
| 23  | `reloadSupport()` as a CLI watch mode | 5 / 7 | 5 / 6 | The cache is process- and thread-independent and keyed on content, so a watch mode's re-transpile of an edited file is a miss for that file and hits for everything else with no eviction design needed; the ESM module-graph eviction question is unchanged. |
| 24  | Persisted `pattern → source file` index | 7 / 9 | 6 / 9 | Now priced against the warm cached startup, in which transpile work is a few hundred milliseconds and nearly everything left is Node's own resolve/read/compile/evaluate of the module graph. Loading fewer files is still the only lever on that, but the absolute number it can recover on a warm run is about 5 s rather than 9 s. |
| 25  | esbuild `build()` bundling | 6 / 10 | 6 / 10 | Unchanged: it attacks the module-graph cost the cache does not touch. |

## Notes specific to Phase 9

- Phase 9 is items 19 and 24. Price 24 against the **warm cached** `default` startup measured here, not the
  Phase 7 9.1 s: with the cache, `support:import` on the full suite is about 5.5 s and almost none of it is
  transpilation, so what 24 recovers is module loading and evaluation of the files a filtered run does not
  need.
- The `parallelLoad` / `origin/Dev-Prebuild` decision is closed: measured, then removed (see
  [`parallelLoad` removal](#parallelload-removal-2026-09-17)). Items 15 and 17 are dropped and `origin/Dev-Prebuild`
  has nothing left to contribute; its first commit, an ahead-of-time esbuild build into `.tsflow-build`, is prior
  art for item 25 and nothing else.
- When measuring startup on this machine, three of seven full-suite runs in this session and two of nine
  `dim` runs had disturbed startup rows (`bootstrap` 0.9–22 s against 0.43 s, or every startup row doubled
  with a normal `runtime:run`); all five were in the profiled first series, the pattern matched each run's
  100 MB `.cpuprofile` being written at its end and scanned at the next run's start, and it stopped when
  profiling was dropped and a 45 s pause added between runs — though the owner's own applications were
  also loading the machine, so the attribution is a fit, not a proof. Measure
  startup from the timing report alone unless a layer split is the question.
- Build with `yarn build`, never bare `tsc`; run `yarn test:all` before calling the phase done.
