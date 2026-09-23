# Phase 6 hand-off

Part of the [Performance Enhancement Execution Strategy](../performance-enhancement-execution-strategy.md).

Written at the start of the Phase 7 session, the morning after Phase 6 closed, so that Phase 7 can start
cold. Phase 6 was a developer-experience phase, not a performance one; nothing in it was measured on the
large suite and nothing in it was expected to move the Phase 5 numbers.

## State of the tree

- Still on branch `2026-09-performance-enhancements`. Phase 6 is five commits: `3a03d4e` ("Startup
  progress: themed phase lines with a worker-thread spinner, wrapping naturally"), `78ca080` ("Startup
  spinner: colour wheel with a three-cell wipe; park the cursor below the block"), `37a596e` ("LOTR startup
  theme: emoji on every line, beacons moved to the load phase"), `5500456` ("ESM callsites map to TypeScript
  lines; startup counter in parentheses") and `ed5bbbf` ("Track the performance research notes and workspace
  settings"). The Phase 5 removals that were uncommitted at the end of that session (`esbuild-transpiler.mjs`,
  `build-esm-transpiler-cjs.js`, the `exports` entry, the `research/` directory) went in with `3a03d4e` and
  `ed5bbbf`. The working tree was clean at the start of the Phase 7 session.
- `yarn build` clean, no stray `.js` under `src/`, `lib/` newer than every source file. `yarn test:all`
  green on all sixteen variants on the tree that became `5500456` (the spec reports under
  `cucumber-tsflow-specs/reports/` are from that run, 2026-09-16 15:42–15:44). Terminal output was checked
  on a real console window with the `verify-console-output` skill added in this phase, not in the captured
  shell.
- Files changed (source): new `src/utils/startup-progress.ts` and `src/utils/startup-progress-worker.ts`;
  `src/api/run-cucumber.ts` (phase lines and callbacks), `src/api/support.ts`, `src/api/loader-worker.ts`,
  `src/api/parallel-loader.ts` (`onFileLoaded` and the `PROGRESS` message), `src/runtime/make-runtime.ts`
  and `src/runtime/parallel/adapter.ts` (`onWorkerReady`); `src/transpilers/esm/loader-utils.mjs`
  (`sourcemap: 'both'`, the per-URL source-map store), `src/utils/our-callsite.ts` (trace-mapping lookup),
  `src/types/global.d.ts`; `package.json` (`@jridgewell/trace-mapping` as a direct dependency) and
  `yarn.lock`. Docs: `CHANGELOG.md`, `Architecture.md` ("Startup progress" section, callsite paragraph),
  `README.md` ("Startup progress"), `CLAUDE.md` (the console-verification rule), the `pnpm-link-consumer`
  skill, and the new `.claude/skills/verify-console-output/`.
- The UIS Tools VueApp link (`pnpm-link-consumer` skill) is in place and points at the current build
  (`7.7.2` on both sides). The UIS `package.json` and `pnpm-lock.yaml` carry that local-only change and
  must not be committed there.
- Added at the start of the Phase 7 session, uncommitted at the time of writing: this hand-off,
  `research/scripts/attribute-cpuprofile.js`, a "Profiling a run" section in
  `research/local-consumer-testing.md`, and a `.gitignore` rule for `research/profiles/`.

## What Phase 6 landed

- **Item 26, the fixed part.** `runCucumber()` prints one line per startup phase — `resolve`, `preload`
  (only with `parallelLoad`), `load`, `assemble`, `launch` — between `Running Cucumber-TsFlow …` and the
  first formatter output. On a TTY each line has a bracketed spinner in a fixed slot, a themed title, a
  plain-language detail and a `(done/total)` counter, and ends with a check mark, a summary and the elapsed
  time; a message line beneath carries heartbeat quips after 30 s of silence and a relief message when work
  resumes after a stall. The spinner is drawn by a `worker_threads` worker writing through its own
  `tty.WriteStream` on the same file descriptor, because the main thread is blocked for most of a phase
  (the first support file's `import()` runs its whole graph through the in-thread hooks) and a main-thread
  timer cannot fire; the main thread waits on an `Atomics` signal for the closing line so the two threads'
  writes stay ordered. Nothing is fitted to the console width: lines are written whole and wrap, and the
  block is redrawn from its first row using a row count derived from the current width, re-read every frame.
  The spinner colour walks a twelve-colour wheel independent of theme and progress. `TSFLOW_THEME` selects
  `pickle` (default), `lotr` or `off`. On a non-TTY stream (CI, a captured shell, a file) the lines are
  append-only and no worker starts, so formatter output and report files are untouched.
- **Item 26, the harness.** `.claude/skills/verify-console-output/` runs built code in a fresh console
  window at several widths and reads the screen buffer back. It exists because a captured shell has
  `isTTY === false` and cannot show redraws, colours or glyph widths; two console facts it uncovered are in
  `Architecture.md` (the TTY stream rather than raw `fs.writeSync`, `CSI 1G` rather than `\r`).
- **Item 26, not done.** None of the optional candidates were taken up: `TSFLOW_TIMING` is still an
  environment variable and not a `--timing` flag, `--verbose` does not report the hooks mode or Node
  version, and transpile errors still surface as a stack rather than a code frame. They remain candidates.
- **Item 28.** Under `es-node-esm` / `es-vue-esm`, step definitions now report their TypeScript line and a
  working-directory-relative `uri`. `loadTypeScript()` transpiles with `sourcemap: 'both'` and keeps each
  module's map on `globalThis.__CUCUMBER_TSFLOW_SOURCE_MAPS`, keyed by URL, on the thread that later
  resolves callsites; `Callsite.resolve()` traces `file:` frames through it with
  `@jridgewell/trace-mapping` (new direct dependency, one decoded `TraceMap` per module) and falls back to
  `source-map-support` for anything not recorded — the ts-node loaders, and the esbuild loaders under
  `TSFLOW_ESM_HOOKS=async`, still report raw positions. Verified with the message formatter on the
  `node-esm` and `vue-esm` specs; CJS unchanged.

## Measured effect on the large suite

None taken. In the captured shell used for the UIS timing runs stdout is not a TTY, so the progress
worker never starts and the Phase 5 `dim` figures stand as the current baseline. The cost of the spinner
worker on a real console (one extra thread, a write every 130 ms during startup) has not been measured and
is not expected to be visible against the 37–47 s of `runtime:run`; it is off entirely with
`TSFLOW_THEME=off`.

## Notes specific to Phase 7

Phase 7 is item 27: one measurement session, no library change. The question is how much of the 37–47 s
`runtime:run` on the UIS `dim` profile is tsflow's own code, and the answer decides whether a runtime
phase exists at all.

- **Capture.** Run the CLI's bin file directly under `node --cpu-prof` from the UIS `test` directory. Do
  not use `NODE_OPTIONS` through `corepack pnpm`: corepack and pnpm are Node processes too and would write
  their own profiles into the same directory. Write the profiles into `research/profiles/<label>/` in this
  repository (gitignored) rather than anywhere under the UIS checkout, whose `.gitignore` has no rule for
  `.cpuprofile` files. The full recipe, with the environment variables, is under "Profiling a run" in
  [local-consumer-testing.md](../local-consumer-testing.md).
- **Attribute.** `node research/scripts/attribute-cpuprofile.js <main-thread .cpuprofile>` prints self
  and inclusive time by layer (tsflow, cucumber-js, jsdom, vue, esbuild, source maps, other dependencies by
  package, node internals, V8 pseudo-frames, consumer files), tsflow's share by `lib/` directory, and hot
  functions overall and within tsflow. By default it attributes only the `runtime:run` window, found as the
  first sample with a `lib/runtime/` frame (`Coordinator.run`, the adapters' `run`, `runBeforeAllHooks`,
  `runTestCase`, the `TestCaseRunner` methods) on the stack; `--all` covers the whole profile and
  `--from-ms`/`--to-ms` set an explicit window. Builtins with no file (`readFileUtf8`, regex, sort, …) are
  charged to the nearest caller that has one, so a builtin called from tsflow counts as tsflow; the hot
  tables still name them. It was checked against a `vue-esm` spec profile (the marker lands 342 ms before
  the end of a 36 s run, which is that suite's entire runtime) and against the UIS `utils` profile.
- **What "tsflow" means in the split.** Frames under `…/cucumber-js-tsflow/cucumber-tsflow/lib/` (the
  linked real path; Node resolves the symlink) or `…/@lynxwall/cucumber-tsflow/`. CucumberJS's own runtime
  (`assembleTestCases`, `runTestRunHooks`, the formatters' envelope handling, `@cucumber/messages`) is
  `cucumber-js`, not tsflow, even though tsflow calls it. The inclusive column answers "how much of the run
  had tsflow anywhere on the stack"; on a serial run that will be nearly everything and is not the number
  that matters. The number that matters is tsflow's **self** time plus the self time of builtins it called,
  which is what the layer table's `self ms` for `tsflow` already is.
- **Idle.** `(idle)` is the event loop with nothing to run — awaiting a timer, I/O or a child. On the
  serial `dim` run, idle inside `runtime:run` is time no JavaScript was using, which points at waits in the
  consumer's steps (`await nextTick`, timers, jsdom's async behaviour) rather than at any library. Report
  it as its own row; it is likely to be a large one.
- **Three runs, discard the first.** The Phase 5 rule holds: `runtime:run` varied 37–47 s across clean
  runs of one build. Take at least three profiles and compare the layer percentages, which are far more
  stable than the milliseconds. Keep `TSFLOW_TIMING=true` on so each profile has a timing report beside
  it (the `runtime:run` row is the denominator the split should be checked against; the two agree to
  within the cleanup tail after the runtime ends). `TSFLOW_THEME=off` keeps the spinner worker out of the
  picture on a real console; in a captured shell it never starts anyway.
- **One profile per thread.** `--cpu-prof` writes `CPU.<date>.<time>.<pid>.<tid>.<seq>.cpuprofile`; the
  main thread is `tid` 0. The `dim` profile is serial with no `parallelLoad`, so one file is expected; a
  second one means a worker thread ran (the spinner, or a preload worker on another profile).
- **The `default` profile's startup is part of this phase.** It has never been measured, and items 16 and
  24 are both priced against it. A `TSFLOW_TIMING=true` run of `corepack pnpm -F uis-tools-test test` (about
  1380 scenarios, 208 step files, several minutes) — three runs, discard the first, same as `dim` — gives
  the startup total and its `esm:load` / transpile share. Record it in the Phase 7 hand-off next to the
  `dim` split. The `origin/Dev-Prebuild` decision (`parallelLoad` kept or removed, which settles items 15 and 17)
  is also outstanding and belongs to the owner.
- Build with `yarn build`, never bare `tsc`; nothing in this phase should need a build at all. If the
  profile does turn up a tsflow hot spot worth fixing, that is a new phase with its own hand-off, not a
  change to make inside this one.
