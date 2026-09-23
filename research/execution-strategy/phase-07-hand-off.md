# Phase 7 hand-off

Part of the [Performance Enhancement Execution Strategy](../performance-enhancement-execution-strategy.md).

Written at the end of the Phase 7 session (2026-09-17) so that Phase 8 can start cold. Phase 7 changed no
library code. It answered item 27 — where does `runtime:run` go on a large consumer — and took the first
measurement of the full UIS suite, which items 16 and 24 are priced against.

## State of the tree

- Still on branch `2026-09-performance-enhancements`; Phase 6 ended at `ed5bbbf` and nothing under
  `cucumber-tsflow/src` changed in this phase. `lib/` is the Phase 6 build (`7.7.2`), which is what the UIS
  link ran. At the time of writing the Phase 7 files were **uncommitted**: this hand-off and the Phase 6
  hand-off above, `research/scripts/attribute-cpuprofile.js`, the "Profiling a run" section of
  `research/local-consumer-testing.md`, and the `.gitignore` rule for `research/profiles/`.
- The captured profiles, console logs (each with its `TSFLOW_TIMING` report) and attribution outputs are
  under `research/profiles/dim-run{1..3}/` and `research/profiles/default-run{1..5}/`, gitignored. The
  profiles are 40–130 MB each; regenerate rather than move them. `attribution.txt` / `.json` in each
  directory is the runtime window; `attribution-startup.txt` (dim 2, dim 3, default 5) is the startup
  window.
- The UIS Tools VueApp link is unchanged and must not be committed there.

## Method

Every run is the recipe under "Profiling a run" in [local-consumer-testing.md](../local-consumer-testing.md):
the CLI's bin file run directly under `node --cpu-prof` from the UIS `test` directory, `TSFLOW_TIMING=true`,
`TSFLOW_THEME=off`, stdout captured (so no spinner thread), one `.cpuprofile` per run. `dim` (334
scenarios, 1396 steps, 200 files through the ESM hooks) was sampled at the default 1 ms; `default` — the
full component test suite, **1571 scenarios, 6992 steps, 974 files loaded, 2578 `load` and 9632 `resolve`
hook calls** — at 2 ms to keep the files near 100 MB. Attribution is `research/scripts/attribute-cpuprofile.js`
over the `runtime:run` window (first sample with a `lib/runtime/` frame to the end of the profile, which
includes the formatter and timing-report tail after the runtime returns); the window agreed with the
timing report's `runtime:run` row to within 20 ms on `dim` and 1.4 s (0.6%) on `default`, the tail being
the three report files. The startup split is the same script with `--to-ms=<window start>`.

Three of the five full-suite runs had disturbed **startup** rows (`bootstrap` 11–15 s against 0.4 s, `esm:load`
34–60 s against 3.6 s). Runs 2 and 3 overlapped with the `dim` attribution jobs I was running in this
session, which parse 40 MB of JSON each; run 4 overlapped with nothing I know of. The runtime window of
runs 3 and 4 was unaffected (the layer percentages match run 5 to within a point) and is used; their
startup rows are not. **Do not run anything heavy while a measurement is in flight**, and treat a
`bootstrap` over a second as a disturbed run.

## Where `runtime:run` goes

`dim`:

| Run | Wall | `support:import` ms | `runtime:run` ms | window ms |
| --- | ---- | ------------------- | ---------------- | --------- |
| 1 (cold) | 64 s | 23030 | 37617 | — |
| 2 | 40 s | 2991 | 33201 | 33218 |
| 3 | 40 s | 2924 | 33866 | 33882 |

`default`:

| Run | Wall | `bootstrap` ms | `support:import` ms | `esm:load` ms | `runtime:run` ms | window ms | Note |
| --- | ---- | -------------- | ------------------- | ------------- | ---------------- | --------- | ---- |
| 1 (cold) | 273 s | 436 | 39599 | 22633 | 224208 | 225891 | first full run on this build |
| 2 | 495 s | 15368 | 137619 | 60016 | 304344 | — | disturbed throughout; discarded |
| 3 | 261 s | 11562 | 14125 | 4071 | 216615 | 216679 | startup disturbed; runtime used |
| 4 | 314 s | 12389 | 79541 | 34063 | 196096 | 197584 | startup disturbed; runtime used |
| 5 | 233 s | 409 | 7706 | 3608 | 219890 | 221267 | clean; the startup baseline |

Self time by layer (self = the sampled frame's own file, with builtins charged to their JavaScript caller;
inclusive = that layer anywhere on the stack). `dim` runs 2 and 3, `default` runs 3, 4 and 5:

| Layer | dim 2 | dim 3 | default 3 | default 4 | default 5 | What it is |
| --- | --- | --- | --- | --- | --- | --- |
| jsdom (+ nwsapi, cssstyle, symbol-tree) | **55.1%** | 55.0% | **65.4%** | 64.2% | 65.1% | DOM tree walks, `querySelectorAll`, `getComputedStyle` |
| vue (`@vue/*`) | **21.4%** | 21.3% | **11.8%** | 11.8% | 11.8% | reactivity, mount, render |
| other dependencies | **12.8%** | 13.2% | **9.5%** | 9.2% | 9.3% | PrimeVue 6–8%, `regexp-match-indices` 1%, Testing Library, `expect` |
| `(garbage collector)` | 3.7% | 3.7% | 6.7% | 7.8% | 7.3% | |
| `(idle)` | 4.8% | 4.6% | 4.6% | 5.0% | 4.6% | event loop with nothing to run |
| node internals | 0.7% | 0.8% | 0.5% | 0.6% | 0.5% | |
| cucumber-js (`@cucumber/*`) | 0.3% | 0.4% | 0.5% | 0.4% | 0.5% | |
| consumer (`test/`, `tools/src/`) | 0.5% | 0.5% | 0.4% | 0.4% | 0.4% | the step and fixture code itself |
| **tsflow** | **0.4%** (123 ms) | 0.4% (124 ms) | **0.4%** (823 ms) | 0.4% (738 ms) | 0.4% (837 ms) | |
| `(program)` | 0.3% | 0.2% | 0.2% | 0.2% | 0.2% | |

tsflow's 0.8 s on the full suite splits `lib/runtime` 0.36 s, `lib/bindings` 0.26 s, `lib/formatter`
0.18 s. Its hottest function is `stepFunction` in `binding-decorator.js` — the wrapper that resolves the
scenario context and invokes the bound method — at 177–213 ms for 6992 steps, **25–30 µs a step**; then
`getStepData` in the behave JSON formatter (79–95 ms), `storeTestStepResult` (68–70 ms), `runStep`,
`aroundTestStep`. Nothing else in tsflow reaches 50 ms on a 220 s run. The inclusive 54% is not a cost: it
is the share of samples taken while a tsflow frame was on the stack (every synchronous step body runs
under `stepFunction`), and the rest are promise continuations with no tsflow caller.

Where the jsdom time goes (`dim` run 2, self by file; the full suite has the same shape): `helpers/style-rules.js`
2.1 s (`getComputedStyle` — walking every stylesheet rule for every element asked), `symbol-tree` 1.9 s (tree
traversal), `generated/Element.js` 1.5 s (`getAttribute` wrappers), `nwsapi` 1.2 s of its own plus **1.6 s
in a builtin `Resolver` called from `nwsapi match_assert`** — the compiled selector functions behind
`querySelectorAll`, the single largest hot spot in the profile at 5% — `node.js` `query`/`filter` 1.2 s,
`Node-impl.js` `textContent` 1.1 s, `cssstyle` 0.9 s.

Inclusive time by package on the full suite (run 3; overlapping): jsdom 65.6%, `@cucumber/cucumber` 54.4%,
`@testing-library/dom` 49.8%, `dom-accessibility-api` 44.0%, `nwsapi` 43.1%, `@vue/runtime-core` 32.7%,
`@vue/reactivity` 27.2%, `@primevue/core` 17.7%, `@testing-library/vue` 16.6%, `@vue/test-utils` 16.5%.
Inclusive by consumer file: `test/fixtures/uis-tools-render.ts` 32.0 s · 14.8% (the mount fixture),
`shared/then-steps.ts` 12.3 s · 5.7%, `uis-agent/research/ticket-queue.ts` 10.9 s · 5.0%,
`shared/when-steps.ts` 9.3 s · 4.3%, `uis-agent/chat/compaction-settings.ts` 8.9 s · 4.1%,
`access-tools/my-request/my-requests.ts` 6.1 s · 2.8%.

**One framework-side cost, upstream of tsflow.** `@cucumber/cucumber-expressions` 19.0.0 (`TreeRegexp.match`)
runs every step match through the `regexp-match-indices` 1.0.2 polyfill. That package's `getPolyfill()`
tests `new RegExp('a').exec('a').indices`, which is `undefined` on every engine because indices are only
produced with the `d` flag, so it never selects the native path and always takes the `regexp-tree`
rewrite. On the full suite that is `regexp-match-indices` 1.9–2.1 s self plus `regexp-tree` 0.5–0.6 s —
**2.5–2.7 s, 1.2% of the run, about 0.4 ms a step** — consistent across all five runs and the largest
single dependency cost outside the DOM stack. It is CucumberJS's dependency, not ours; the fix is upstream
(pass `d` and use native `exec`, or fix the feature test in `regexp-match-indices`). Recorded as item 29
below.

## Where startup goes

`dim` (runs 2 and 3, the first 4.1 / 4.0 s: `bootstrap` + `config` + `support:import` + `registry:update` +
`formatters:init` + `gherkin` + `makeRuntime`) and `default` (run 5, the first 9.1 s):

| Layer | dim 2 | dim 3 | default 5 | Hot spots (default 5) |
| --- | --- | --- | --- | --- |
| node internals | 3.09 s · **75.5%** | 2.97 s · 74.4% | 5.46 s · **59.9%** | `internalModuleStat` 1.0 s, `ModuleWrap` 0.5 s, `readFileUtf8` 0.49 s, `lstat` 0.31 s, `compileFunctionForCJSLoader` 0.30 s, `readPackageJSON` 0.25 s, `existsSync` 0.24 s |
| esbuild | 0.33 s · 8.0% | 0.33 s · 8.4% | 1.54 s · **16.9%** | `runCallSync` — the `.ts`/`.vue` script transpiles |
| other dependencies | 0.32 s · 7.7% | 0.32 s · 7.9% | 0.71 s · 7.7% | module evaluation of the consumer's dependency graph |
| vue | 0.14 s · 3.4% | 0.15 s · 3.6% | 0.59 s · 6.5% | `@vue/compiler-sfc` 0.45 s / **1.25 s inclusive** — compiling the `.vue` files |
| cucumber-js | 0.05 s | 0.06 s | 0.21 s · 2.3% | |
| tsflow | 0.04 s · 1.0% | 0.04 s · 1.0% | 0.18 s · 2.0% | `tsconfig-paths` 0.24 s inclusive |
| jsdom | 0.05 s | 0.05 s | 0.05 s | `jsdom-global` set-up 0.45 s inclusive |

The timing report for `default` run 5 says the same thing in its own columns: `support:import` 7.7 s of which
`esm:load` 3.6 s and `esm:resolve` 1.9 s; the per-file `transpile ms` total is 2.86 s (esbuild plus the SFC
compiler), 974 files. So on the full suite the transpile work is about 2.8 s of a 9.1 s warm startup, and
Node's own resolve, read and compile of the module graph is about 5.5 s; on `dim` the split is 0.8 s of
4 s against 3 s. tsflow's own startup code is 40 ms on `dim` and 180 ms on the full suite.

## Conclusions

1. **There is no tsflow runtime phase.** tsflow's self time inside `runtime:run` is 0.4% on both suites,
   stable across five runs, and its hottest function costs 25–30 µs a step. CucumberJS is another
   0.4–0.5%. The runtime is jsdom (55% on `dim`, 65% on the full suite), Vue (21% / 12%) and the PrimeVue
   component library (8% / 6%), driven by the consumer's `@testing-library` queries and assertions
   (`querySelectorAll`, `getComputedStyle`, accessible-name computation). Item 27 is closed with "none
   found"; the runtime items that Phase 2 removed were the last.
1. **For the UIS suite's owners, the run time is in the tests' DOM queries, not the framework.** The two
   largest single costs are `nwsapi` selector matching under `querySelectorAll` (5%) and jsdom's
   `getComputedStyle` (6%), both reached through `@testing-library/dom` and `dom-accessibility-api` (role
   and accessible-name queries walk the tree and compute styles per element; together they are on the
   stack for 44–50% of the run). Narrower queries (`getByTestId`, scoping to a container), fewer
   visibility assertions, and reusing mounts within a scenario (`uis-tools-render.ts` is on the stack for
   15–23% of the run) would move the number; nothing in cucumber-tsflow will. This is outside the worklist
   and is recorded here for the consumer, not as a phase.
1. **Startup is mostly Node's module loader, with the transpilers a real second.** On the full suite,
   Node resolving, reading and compiling 974 modules is 5.5 s of a 9.1 s warm startup; esbuild plus the Vue
   SFC compiler are 2.8 s. That is the number Phase 8 is for: item 16's on-disk cache can recover up to
   about 2.8 s (31%) on the full suite and 0.8 s on `dim` — provided it caches the `.vue` compile as well as
   the esbuild output — and nothing of the 5.5 s. The items that attack the module graph itself, 24 (load
   only the step files a filtered run needs) and 25 (one bundle instead of 974 module loads), are the only
   ones that reach the larger share.
1. **Idle is small and GC is not.** Idle is 4.6–5% of the run on both suites; the suite is CPU-bound in
   jsdom, so there is no waiting to overlap and `parallel: N` (the consumer's configuration) is the only
   lever that changes the wall clock without changing the tests. Garbage collection is 7–8% on the full
   suite against 3.7% on `dim`, which points at the consumer's per-scenario DOM and component churn, not
   at anything the library allocates.
1. **The one framework-side cost found is upstream.** The `regexp-match-indices` polyfill in
   `@cucumber/cucumber-expressions` costs 1.2% of the run through a broken feature test. Worth a report or
   PR upstream; not worth a tsflow phase.

## Re-rating after Phase 7

| #   | Change | I/C after Phase 5 | I/C now | Why |
| --- | --- | --- | --- | --- |
| 16  | Content-addressed on-disk transpile cache | 4 / 7 | 4 / 7 | Confirmed by measurement: esbuild + SFC compile are 2.8 s of a 9.1 s warm startup on the full suite (0.8 s of 4 s on `dim`). Must cache `loadVue()` output too or it gets only the esbuild 1.5 s. |
| 23  | `reloadSupport()` as a CLI watch mode | 5 / 7 | 5 / 7 | Unchanged: the only item that removes the 5.5 s of module loading from the inner loop. |
| 24  | Persisted `pattern → source file` index | 7 / 9 | 7 / 9 | Now priced against a measured 9.1 s full-suite startup over 974 files; a filtered run loads a small fraction of them. |
| 25  | esbuild `build()` bundling | 5 / 10 | 6 / 10 | Now aimed at the largest measured startup cost (Node's per-module resolve/read/compile, 5.5 s) rather than at hook overhead. Still last on complexity. |
| 27  | Attribute `runtime:run` | ? / 2 | closed | Measured: tsflow 0.4%, cucumber-js 0.4–0.5%, on both suites. No runtime phase follows. |
| 29  | **New: `regexp-match-indices` polyfill in cucumber-expressions** | — | 1 / 1 (upstream) | 1.2% of `runtime:run`, 0.4 ms a step, from a feature test that can never pass. Report or PR to `cucumber/cucumber-expressions` (or `regexp-match-indices`); nothing to do in tsflow. |

## Notes specific to Phase 8

- Phase 8 is item 16 first. Decide up front what the cache stores: esbuild output only (1.5 s on the full
  suite) or the `.vue` SFC compile as well (`loadVue()` in `loader-utils.mjs`, another 1.25 s). The second
  is where almost half of the recoverable time is, and it is the same `load` hook.
- The cache saves nothing of Node's own resolve/read/compile of the module graph (5.5 s). Expect
  `support:import` on the full suite to fall from 7.7 s towards 5 s on a warm cache, not further.
- Measure it with the same recipe: profile the startup window (`attribute-cpuprofile.js --to-ms=<window
  start>`) before and after and compare the `esbuild` and `vue` rows and the timing report's `transpile ms`
  column; `default` run 5 in `research/profiles/` is the before. Three runs, discard the first, and nothing
  else running on the machine — three of the five full-suite runs in this phase had disturbed startup rows.
- The `parallelLoad` / `origin/Dev-Prebuild` decision is still the owner's and still gates items 15 and 17.
  Nothing in Phase 7 bears on it except that preload's only remaining purpose would be to warm the cache
  item 16 creates.
- Build with `yarn build`, never bare `tsc`; run `yarn test:all` before calling the phase done.
