# Phase 4 hand-off

Part of the [Performance Enhancement Execution Strategy](../performance-enhancement-execution-strategy.md).

Written at the end of the Phase 4 session so that the Phase 5 session can start cold.

## State of the tree

- Still on branch `2026-09-performance-enhancements`. Phase 3 was committed as `975cedd` ("ESM Loader
  caches"). At the time of writing the Phase 4 changes were **uncommitted, pending code review**; check
  `git log` and `git status` before assuming either way.
- `yarn build` clean, no stray `.js` under `src/`; `yarn test:all` green on all sixteen variants on the
  build before the jsdom fix below and again on the final build. ESLint and Prettier clean on every changed
  file; `tsc --noEmit` on the spec workspaces (`node`, `node-esm`) resolves the new entry point's types.
- Files changed: `src/utils/our-callsite.ts` (rewritten), `src/bindings/binding-registry.ts`
  (`stepBindingKey`), `src/bindings/binding-decorator.ts` (imports), `src/index.ts` (root barrel),
  `src/runtime/types.ts`, `src/runtime/make-runtime.ts`, `src/runtime/parallel/adapter.ts`,
  `src/runtime/parallel/worker.ts`, `src/api/run-cucumber.ts`, `bin/cucumber-tsflow.js` and
  `bin/cucumber-tsflow` (identical), `package.json` (`exports`, `files`). New: `src/bindings.ts`,
  `src/bindings.mjs`, `bindings/index.d.ts`. One spec file per workspace
  (`src/step_definitions/basic-test.ts`, all eight) imports from `@lynxwall/cucumber-tsflow/bindings` so the
  entry point is exercised in every variant. Plus `CHANGELOG.md`, `Architecture.md` (Registration Flow,
  Registry Internals, Parallel Execution, CLI, Package Exports) and `README.md` (Bindings, Compile cache).
- The UIS Tools VueApp link (`pnpm-link-consumer` skill) was in place throughout and was not changed.

## What Phase 4 landed

- **Item 8.** `Callsite.capture()` now stores only the raw V8 frame, taken with `Error.stackTraceLimit`
  lowered to the three frames needed (`capture`, the decorator factory, the support file) and
  `Error.prepareStackTrace` swapped and restored around one `new Error()`. `filename`/`lineNumber` are
  getters that run `sourceMapSupport.wrapCallSite` on first read and memoize; `rawPosition`
  (`file:line:column` of the executed code) is free. `stepBindingKey` in the registry keys on
  `rawPosition` instead of the mapped file and line, so `registerStepBinding` never resolves. The first
  resolution therefore happens in `updateSupportCodeLibrary`, after all support code has loaded — that is
  where the cost moved, and where the finding below was made. The cwd-stripping now uses `path.sep`, so
  Linux/macOS `uri`s become cwd-relative like Windows ones (the one behaviour change; CI is Linux and the
  spec features do not assert on `uri`). Reported `uri`/`line` values on Windows are byte-identical before
  and after in nine of the ten spec reports; the tenth (`esvue.html`) differs only because `vue-esm` and
  `vue-exp-esm` both write that filename and a different profile was the last writer — a pre-existing spec
  config collision, not a behaviour change. Microbenchmark, plain Node, 30-deep stack: old capture
  21.5 µs, new capture 6.0 µs, deferred resolve 6.1 µs per binding.
- **The jsdom finding (unplanned, item 8's real payoff).** Once resolution was deferred, `registry:update`
  on the UIS `dim` profile measured 20 s where Phase 2 had measured 0.6 ms, and `support:import` dropped
  by the same 20 s. The cause: `source-map-support` (`isInBrowser()`) treats a process with `window` and
  `XMLHttpRequest` globals — which every jsdom set-up creates, including our own `vue-jsdom-setup.mjs` —
  as a browser, and `retrieveSourceMapURL` then issues a **synchronous `XMLHttpRequest`** for each source
  file before falling back to `fs` anyway. jsdom services a sync XHR by spawning a process. Reproduced in
  isolation: 0.3 ms per file without jsdom globals, 680 ms per file with them; the `dim` profile has 34
  step files, so ~20 s. This has been happening on every Vue/ESM consumer run since decorators first
  captured callsites, and the Phase 3 hand-off misread it as module evaluation. In CJS mode it does not
  occur because ts-node redirects `require('source-map-support')` to its own `@cspotcode` copy installed
  with `environment: 'node'`. Fix: `withoutBrowserDetection()` in `our-callsite.ts` deletes the
  `XMLHttpRequest` global for the duration of the synchronous `wrapCallSite` call when both globals are
  present and the property is configurable, and restores it in `finally`. It mutates no library state and
  behaves identically for consumers whose ESM support files do carry source maps. Calling
  `sourceMapSupport.install({ environment: 'node' })` was rejected because `install()` also sets
  `Error.prepareStackTrace` and a one-shot `errorFormatterInstalled` flag that would silence a consumer's
  own later `install()`.
- **Item 10.** `InitializeTsflowCommand` gained `resolvedSupportPaths: Pick<IResolvedPaths, 'requirePaths' |
  'importPaths'>`; `runCucumber` passes its already-resolved lists through `makeRuntime` →
  `ChildProcessAdapter` → `INITIALIZE`, and `ChildProcessWorker.initialize` uses them instead of calling
  `resolvePaths` (its `logger` and `resolvePaths` imports are gone). `IMessageData.coordinates` is still
  sent and now unused by the worker; left alone. Measured directly against the UIS `test/` tree with
  cucumber's `resolvePaths`: 2–9 ms warm for the `dim` (34 files) and `default` (209 files, 206 features)
  profiles alike. The saving per child is real but single-digit milliseconds on a warm cache; the rating of
  4 was too high for this machine and is a cold-cache/network-drive number.
- **Item 14.** `bin/cucumber-tsflow.js` calls `module.enableCompileCache()` (guarded by `typeof`) before
  requiring `lib/cli/run.js` and, if Node returned a directory and `NODE_COMPILE_CACHE` is unset, exports
  that directory as `NODE_COMPILE_CACHE`. That export matters: `enableCompileCache()` does **not** set the
  variable itself (verified on Node 24.16), so without it forked children and preload worker threads would
  start without the cache. `NODE_DISABLE_COMPILE_CACHE=1` and `NODE_COMPILE_CACHE=<dir>` are honoured by
  Node. **Measured neutral** on the UIS `dim` profile — see the table; `bootstrap` 397–438 ms with the
  cache versus 397–402 ms without, wall clock identical within noise. Sources produced by the ESM loader
  hooks are evidently cached or not without visible effect either way. Whether to keep it is a review
  decision: it costs nothing measurable and may help cold CI starts or CJS suites, neither of which was
  measured here; if it is dropped, the README "Compile cache" section, the CHANGELOG entry and the
  Architecture CLI paragraph go with it.
- **Item 20.** New `@lynxwall/cucumber-tsflow/bindings` (`src/bindings.ts` + `src/bindings.mjs`, copied to
  `lib/` by the existing `copy:root-mjs` step; `exports["./bindings"]` with `types`/`import`/`require`;
  `bindings/index.d.ts` stub mirroring `api/index.d.ts`; `files` updated). It exports the decorators, the
  context classes and the CucumberJS support-code helpers; the root barrel does `export * from './bindings'`
  and adds the formatters, snippet syntax, `version` and `Cli`. `Cli` is now a `deprecate()`-wrapped
  function that `require`s `./cli` on first construction, so importing the root no longer loads the CLI
  (`new Cli(...).run()` unchanged; `instanceof Cli` no longer meaningful — noted in the CHANGELOG).
  `binding-decorator.ts` takes `Given`/`Before`/… from `supportCodeLibraryBuilder.methods` instead of the
  `@cucumber/cucumber` root barrel, which alone was 456 modules. Warm module counts / load time on Node 24:
  root before 593 / 550 ms, root after 540 / 480 ms, `bindings` 239 / 210–350 ms. The `.mjs` wrappers export
  `ScenarioContext`, `StartTestCaseInfo` and `EndTestCaseInfo` as `undefined` because they are interfaces;
  the pre-existing `wrapper.mjs` does the same, so parity was kept. UIS step files still import the root, so
  only the lazy `Cli` part of this item is in the UIS numbers.

## Measured effect on the large suite

UIS Tools `dim` profile (324 scenarios, 1363 steps, `es-vue-esm`, experimental decorators, serial),
`TSFLOW_TIMING=true`, same machine and session, all runs green. Three builds: **Phase 3** (the committed
`975cedd` loaders, obtained by stashing the Phase 4 tree and rebuilding), **Phase 4 (lazy only)** —
everything above except the jsdom fix, which is what exposed the finding — and **Phase 4 (final)** with the
fix. Run 1 after each `yarn build` is omitted (cold cache: 128–219 s). `NODE_DISABLE_COMPILE_CACHE=1` rows
isolate item 14.

| Build                    | Run | `support:import` ms | `registry:update` ms | startup (import + update) | `bootstrap` ms | `esm:resolve` ms | `esm:load` ms | `runtime:run` ms | Wall  |
| ------------------------ | --- | ------------------- | -------------------- | ------------------------- | -------------- | ---------------- | ------------- | ---------------- | ----- |
| Phase 3                  | 2   | 25807               | 0.4                  | 25.8 s                    | 445            | 1403             | 1449          | 43535            | 77 s  |
| Phase 3                  | 3   | 24212               | 0.9                  | 24.2 s                    | 422            | 1221             | 1325          | 59214            | 91 s  |
| Phase 3                  | 4   | 29131               | 0.8                  | 29.1 s                    | 437            | 1986             | 2307          | 86368            | 124 s |
| Phase 4 lazy, cache      | 2   | 4807                | 20803                | 25.6 s                    | 446            | 1386             | 1276          | 49320            | 83 s  |
| Phase 4 lazy, cache      | 3   | 4980                | 20012                | 25.0 s                    | 455            | 1441             | 1258          | 50432            | 83 s  |
| Phase 4 lazy, cache      | 4   | 4836                | 19815                | 24.7 s                    | 438            | 1279             | 1267          | 49845            | 83 s  |
| Phase 4 lazy, no cache   | 1   | 4674                | 20925                | 25.6 s                    | 453            | 1294             | 1301          | 46769            | 84 s  |
| Phase 4 lazy, no cache   | 2   | 4898                | 20711                | 25.6 s                    | 442            | 1482             | 1391          | 53102            | 89 s  |
| Phase 4 lazy, no cache   | 3   | 5115                | 21247                | 26.4 s                    | 511            | 1389             | 1474          | 51851            | 92 s  |
| Phase 4 final, cache     | 2   | 3749                | 9.3                  | 3.8 s                     | 405            | 1037             | 1005          | 45734            | 56 s  |
| Phase 4 final, cache     | 3   | 3954                | 13                   | 4.0 s                     | 397            | 1040             | 1046          | 45652            | 56 s  |
| Phase 4 final, cache     | 4   | 3781                | 12                   | 3.8 s                     | 438            | 1048             | 1027          | 45158            | 57 s  |
| Phase 4 final, no cache  | 1   | 3965                | 12                   | 4.0 s                     | 397            | 1099             | 1201          | 45137            | 56 s  |
| Phase 4 final, no cache  | 2   | 4564                | 19                   | 4.6 s                     | 399            | 1271             | 1276          | 46528            | 58 s  |
| Phase 4 final, no cache  | 3   | 4226                | 10                   | 4.2 s                     | 402            | 1175             | 1247          | 48886            | 61 s  |

Conclusions:

1. **Startup on this profile went from 24–29 s to 3.8–4.6 s, and wall clock from 77 s (best baseline run)
   to 56–58 s.** All of it is the jsdom finding. The "lazy only" rows prove the attribution: the 20 s left
   `support:import` and reappeared, to the millisecond, in `registry:update`, where the deferred
   `wrapCallSite` calls now run; the final rows remove it. Genuine module evaluation of the 34 step files
   and their component graph is the ~4 s that remains, of which `test-setup.mjs` is about 0.8 s.
1. **`runtime:run` is not comparable in this session.** The Phase 3 baseline itself ranged 43.5–86.4 s over
   three warm runs (35 VS Code processes and on-access antivirus were active; Phase 3's own session measured
   39–41 s). Nothing in Phase 4 touches the per-step path, and the final build's 45.1–48.9 s sits inside the
   baseline's range. Do not read the 83 s "lazy only" wall clocks as a regression either; their
   `runtime:run` spread is the same noise.
1. **The compile cache is neutral here.** `bootstrap` and wall clock are indistinguishable with and
   without it, in both the lazy-only and final builds.
1. **Items 6/7 from Phase 3 read a little better on the final build** (`esm:resolve` 1.04–1.27 s,
   `esm:load` 1.0–1.3 s) but the baseline rows in this session are noisier than Phase 3's, so treat that
   as unchanged.

## Notes specific to Phase 5

- **ESM callsites have always been raw positions.** In every ESM variant the frame's file is a `file://`
  URL and no source map is found for it (the `.ts` on disk has no `sourceMappingURL`; the transpiled output
  with its inline map lives on the loader-hooks thread), so `uri` is the URL and `line` is the compiled
  line — verified against the spec reports (TS line 50 reported as 53 under esbuild, 52 as 55 under
  ts-node). CJS gets mapped TS lines via ts-node's redirected `source-map-support`. Making ESM correct
  means getting the inline map from the hooks thread to the main thread (the Phase 1 timing plumbing
  already has a `MessageChannel` between them) or using `module.findSourceMap()` with source maps enabled.
  That is Phase 5 territory because item 18/21 decide where the transpiled output lives; it is a
  correctness item, not a performance one, and it is unrated on the worklist.
- With the jsdom cost gone, the remaining warm startup on the `dim` profile is ~4 s of real module
  evaluation plus ~1 s each of `esm:resolve` and `esm:load`, 0.4 s `bootstrap`. Item 16 (transpile cache)
  attacks `transpile ms`, which is under 1 s here; Phase 6's scope should be re-read against these numbers.
  Consumers whose suites are large and non-jsdom were never paying the 20 s and will see only the small
  wins.
- The spec `cucumber.json` files in `vue-esm` and `vue-exp-esm` both write `../reports/esvue.*`, and
  `node-exp`'s `es-node-esm` profile writes `tsnode-exp.*`; whichever runs last wins. Harmless for pass/fail
  but it defeats before/after report diffing for those variants. Not fixed (out of scope).
- Nothing in Phase 4 changed a loader or the `.mjs` files; the Phase 1 timing plumbing is unchanged, so
  `esm:*` phases and file tables remain comparable across all four phases. The IPC contract changed
  (`INITIALIZE` gained `resolvedSupportPaths`); coordinator and child are always the same build so no
  compatibility shim was added.
- Prettier's `endOfLine: crlf` applies to everything under `cucumber-tsflow/src`; files written by tooling
  with LF need `prettier --write` before the diff is clean, and `Architecture.md` is CRLF on disk too.
- Build with `yarn build`, never bare `tsc`; run `yarn test:all` before calling the phase done; take at
  least three runs per build on the UIS profile and discard run one.
