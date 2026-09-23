# Phase 12 plan

Part of the [Performance Enhancement Execution Strategy](../performance-enhancement-execution-strategy.md).

The scope of Phase 12 as written before the phase began, and the baseline taken at its start: the state of the tree, the decisions taken with the owner, the coverage inventory, the review findings list, the 12c triage, and the split into stages 12a to 12f with their gates. The stage hand-offs are separate documents beside this one.

## Phase 12 scope

Phase 12 is the release gate. Phases 1–10 each ended green on `yarn test:all` (Phase 11 changed no code), but that
suite was written for the
product as it stood before Phase 1: nine feature files, all end-to-end through the built CLI, none of which
exercise the transpile cache, selective loading, the module graph, the startup progress line or the timing
instrumentation directly, and only one each for `reloadSupport()` and `--watch`. The phase has three strands.
They are deliberately one phase, and the reason is ordering: a refactor without a test is a change nobody can
verify, and a test written after the refactor only proves the refactored code does what the refactored code
does. Testing first, and letting the review findings accumulate while the tests are written, gives every later
tightening a net and turns the review from a read-through into a hands-on pass.

### Strand 1: test build-out (first)

- **Inventory what is new and how it is covered.** The modules added on this branch are `api/register-loaders.ts`,
  `api/selective-load.ts`, `api/support-reloader.ts`, `api/builder-fingerprint.ts`, `transpilers/transpile-cache.ts`,
  `utils/module-graph.ts`, `utils/startup-progress.ts`, `utils/startup-progress-worker.ts`, `utils/tsflow-timing.ts`,
  `cli/watch.ts` and the `bindings` entry point, plus substantial rewrites of `api/support.ts`, `api/run-cucumber.ts`
  and the ESM `.mjs` loaders. For each, record what the spec matrix already exercises indirectly and what has no
  test at all. The phase hand-off documents beside this one (`phase-01-hand-off.md` to `phase-11-hand-off.md`) list the behaviors each phase promised; those promises are the test
  list.
- **Decide the test vehicle before writing.** The spec workspaces are end-to-end and slow, and they are the right
  place for behavior a user sees: a cache hit on a second run, a selective run loading fewer files, a watch rerun
  after an edit. The pure modules — fingerprinting, the cache key and its invalidation inputs, module-graph
  stamping and change detection, the `SupportReloader` eviction decision, argv parsing, the progress line's
  stall/relief state machine — want unit tests that run in milliseconds without a CLI. The repository has no unit
  test runner today (only `chai` in the spec workspaces). `node:test` needs no new dependency and Node ≥ 22 is
  already required; adding mocha, vitest or jest is a dependency decision for the owner. Settle this first and
  add the script to the root `package.json` and CI.
- **Coverage that matters most**, in the order the risk suggests: (1) selective loading's fallback conditions —
  new files, changed import graphs, files that registered non-step bindings — since a wrong "skip" is a silently
  missing step; (2) transpile-cache invalidation on every key input (source, path, options, tool versions, tsflow
  version) and the `--no-transpile-cache` bypass; (3) watch mode's second and third run, both module systems,
  including the `?tsflow=<n>` versioning and `BindingRegistry.clear()`; (4) the `SupportReloader`'s "registered
  something" observation; (5) the parse-before-load buffering of Gherkin envelopes and its formatter ordering;
  (6) idempotency of everything on the load path when `getSupportCodeLibrary` runs twice in one process.
- Keep to the repository's rule: no tests that merely validate third-party APIs or that an exception is thrown.

### Strand 2: the review

- Read the branch diff module by module, with the tests from strand 1 open beside it. Look for: the same
  concern implemented twice in different phases (caching, path normalization and file stamping each appeared in
  more than one place); functions that grew a flag parameter per phase; options that Phase 8 or later made
  irrelevant but that are still parsed; instrumentation and checkpoints added for a measurement that is finished;
  `global.*` coordination that could now be a passed value; and files that have become two modules sharing a
  name. Record each finding as a one-line entry with the file and the proposed change before changing anything,
  so the list can be pruned with the owner.
- Land the refactors behind the strand 1 tests and the spec matrix, one concern per commit.
- Bring [Architecture.md](../../Architecture.md), the README and the CHANGELOG up to the final shape in the same
  pass; the layer map and execution flow in Architecture.md describe Phase 9 and 10 correctly but not yet as a
  whole.

### Strand 3: housekeeping sweeps

- **`strictNullChecks`.** The build config leaves `strict` off, so `yarn build` passes code the editor flags.
  Today `npx tsc --noEmit -p tsconfig.node.json --strictNullChecks` (from `cucumber-tsflow/`) reports 21 errors in
  four files: `runtime/message-collector.ts` (12), `runtime/test-case-runner.ts` (5), `api/convert-configuration.ts`
  (3), `bindings/binding-context.ts` (1). Fix them, then turn the flag on in `tsconfig.json` so the build and the
  editor agree, and add a `typecheck` script. Consider `strict` as a whole at the same time (it adds one more
  error today, in the same files). Related: ESLint's `no-undef` cannot see the Node global types (`NodeJS.*`,
  `BufferEncoding`), which is why `cli/index.ts` and `cli/watch.ts` carry disables; typescript-eslint's guidance
  is to turn `no-undef` off for TypeScript files and let `tsc` own that check.
- **American English.** Source has 34 British spellings in 5 files, 28 of them `colour` and its identifiers
  (`wheelColour`, `coloured`, `Colours`), the rest `serialise`, `recognise`, `normalise`, `initialise`, `grey`.
  Documents have about 90 across 12 files, led by `behaviour` (39) and `colour` (21). Rename identifiers only after
  checking the `exports` map and the spec workspaces for consumers; CucumberJS's own names (`colorFns`) are already
  American, so nothing on that boundary changes. Do the documents with a scripted pass and a manual read.

### Exit criteria

- `yarn build` clean; `yarn test:all` green; the new unit-test script green and wired into CI.
- `typecheck` clean with `strictNullChecks` on; `yarn lint` clean without new disables.
- No British spellings in `cucumber-tsflow/src` or the root and research documents.
- Architecture.md, README and CHANGELOG describe the product as it ships, not as a sequence of phases.
- The review's findings list is fully resolved: each entry either landed or was closed with a reason.

## Phase 12 baseline

Written at the start of the Phase 12 session (2026-09-22), after grounding in the [Phase 12 scope](#phase-12-scope)
and a read-only coverage inventory of the branch, so that the decisions and the starting numbers are in one place.

### State of the tree at the start

- Branch `2026-09-speed-enhancements` at `9395c83` (the Phase 11 hand-off), clean. `yarn build` green, no stray
  `.js` under `src`; `npx eslint cucumber-tsflow/src` reports 0 errors and 1 warning (a missing semicolon in the
  generated `version.ts`).
- `npx tsc --noEmit -p tsconfig.node.json --strictNullChecks` from `cucumber-tsflow/`: **21 errors** in
  `runtime/message-collector.ts` (12), `runtime/test-case-runner.ts` (5), `api/convert-configuration.ts` (3),
  `bindings/binding-context.ts` (1). `--strict` reports the same 21 and nothing more.
- British spellings: **26 in `src`** across `utils/startup-progress.ts` (the `colour` family, 24), `cli/run.ts`,
  `api/support-reloader.ts`, `transpilers/transpile-cache.ts`, `utils/module-graph.ts` and
  `transpilers/esm/README.md`; about **90 in Markdown** across 15 files, 34 of them in the execution strategy (one file at the time).
- No unit test and no unit-test runner exist anywhere in the repository. The test suite is 16 CLI invocations
  over 9 shared feature files; `chai` is a devDependency of each spec workspace only.
- `selectiveLoad: true` is set in 5 of the 18 profiles, `transpileCache` and `watch` in none (`watch` is passed on
  the command line by the watch spec; `parallelLoad` is set nowhere, so its deprecation notice never runs). Both
  caches live under `node_modules/.cache`, so on a clean CI checkout every run takes the cold branch: the
  selective-load skip path and the transpile-cache hit path are never executed in CI, and no spec asserts on
  either.
- The root `README.md` is 1124 lines. The branch added 94 of them in one block (lines 447–557: startup progress,
  timing, compile cache, transpile cache, selective loading, watch mode, ESM loader hooks) plus two small edits.
  `cucumber-tsflow/README.md`, which is what npm publishes, was identical to the root README at `master` and is
  now 100 lines behind it. The root README has LF line endings against the repository's CRLF rule. There is no
  `docs/` folder.
- The root `lint` script pipes `eslint --fix` into `prettier --write` into the whole CJS, ESM and experimental
  test matrix, so it is not a lint gate.

### Decisions taken with the owner

| Decision | Choice | Why |
| --- | --- | --- |
| Unit-test runner | **`node:test`** (`node --test`), `chai` for assertions | No new dependency: Node 24 runs `.ts` test files directly through type stripping (confirmed against `lib/` in a smoke test) and handles the `.mjs` twins natively; `chai` is already in the tree and is what the spec step definitions use. vitest was considered and declined: the owner's team does not use it, and built-ins are preferred when they achieve what is needed. |
| Import target of the unit tests | the built **`lib/`** | It is what ships and what the spec matrix already tests; `yarn build` before `test:unit`, as for every other test script. |
| `TSFLOW_TIMING` instrumentation | **keep and test** | It is documented in README, CHANGELOG and Architecture.md and is the only way to diagnose a future startup regression. |
| Documentation layout | **`docs/` folder, one guide** | `docs/performance-and-diagnostics.md` takes the 94-line README block (transpile cache, selective loading, watch mode, startup progress, timing, hooks mode); the root README keeps one paragraph that links to it. The package README becomes a build-time copy of the root README so the two cannot drift again. The pre-existing README bloat (five "Release Updates" sections, about 80 lines duplicating the CHANGELOG) is flagged, not part of this phase. |
| Strand 2 depth | **full list, including the two large consolidations** | Module eviction exists twice and only the newer copy clears the registry; the decorator mode reaches the transpilers three ways. Both land only behind the strand 1 tests. |
| Spec workspaces' `chai` | **unchanged** | Migrating 59 step files (about 350 assertions) to `node:assert` was offered and not requested. |

### Coverage inventory

What the spec matrix exercises today, and what has no test, per module added or rewritten on the branch.
"Indirect" means the code runs in some spec profile but nothing asserts on its behavior.

| Module | Indirect coverage today | Untested behaviors that matter | Vehicle |
| --- | --- | --- | --- |
| `cli/argv-parser.ts` | only `-p <profile>` and `--watch` | the paired `--x` / `--no-x` declarations (bare form absent leaves `undefined`, `--no-x` leaves `false`), `mergeTags`, `mergeJson`, `validateCountOption`, positional paths clearing profile paths | unit, no seam |
| `utils/module-graph.ts` | selective load and watch only | `canonicalPath` on Windows drive letters and case, `isProjectModule` exclusions (the pnpm `link:` fix), `versionedUrl` with an existing query, the CJS fixed-point dependent closure, edge forgetting on `bumpModuleVersions` | unit; `require.cache` walkers need an injectable cache |
| `api/builder-fingerprint.ts` | every run, never asserted | each of the six fields `registeredBeyondSteps` compares | unit, no seam |
| `transpilers/transpile-cache.ts` | every run, cold, never asserted | invalidation on each key input (source, path, kind, options string, tool versions, tsflow version, entry format); `--no-transpile-cache`; corrupt-entry deletion; write failure still returning the result; prune order; the `node_modules` → `package.json` → `tmpdir` directory walk | unit (`produce` is a callback, `TSFLOW_TRANSPILE_CACHE_DIR` redirects the store); one e2e for the bypass and a warm hit |
| the three cache-key strings in `transpilers/esbuild.ts`, `esm/esbuild.mjs`, `vue-sfc-compiler.ts` | CJS and Vue profiles | that each input changes the key | unit |
| `api/selective-load.ts` | 5 profiles, first-run branch only | new file → load; changed import graph → load; `always` for hooks, parameter types, World, timeout, wrapper, no-steps; undefined step → full plan; `literalPrefix` (a wrong prefix silently drops a step); non-compiling pattern; corrupt index; `abort()` writing nothing; skipped-file records surviving `finish()` | unit after exporting the matching helpers; e2e for the skipped count |
| `api/support-reloader.ts` | one CJS watch scenario (3 Enter-driven runs) | the "registered something" observation; the five contributors to the re-evaluate set; `kept > 0`; `abort()` after a failing load; the ESM `?tsflow=<n>` rerun (not in the matrix at all) | unit with stubbed module-graph; e2e on `node-esm` |
| `api/register-loaders.ts` | every ESM profile, both hook modes | the `loaderHooksMode` truth table; the Phase 10 dedupe (a second load in one process must not stack hooks) | unit |
| `api/support.ts` | every run | `composeRecorders`; `getSupportCodeLibrary` twice in one process (idempotency); the `boolean` parameter type surviving a reload | unit |
| `api/run-cucumber.ts` | every run, parse-error-free | envelope buffering and replay order (`meta`, Gherkin, support code); the parse-error path; failure-path spinner cleanup; `alreadyLoaded` | e2e with a deliberate parse-error feature; unit for `describeTranspileCache` |
| `utils/startup-progress.ts` | plain (non-TTY) text only, via one regex in the watch spec | the stall / relief state machine, heartbeat, message self-clear, `{done}/{left}/{total}/{elapsed}` substitution, `rows()` on wrapped and emoji lines, worker-timeout fallback, `TSFLOW_THEME=off`, `describeTranspiler` for all eight names | unit (`PhaseRenderer` already injects `write`, `theme`, `mode`, `columns`); needs a clock seam for `performance.now()` |
| `utils/startup-progress-worker.ts` | nothing (TTY only) | `openTerminal` fallback on a bad descriptor; the end handshake | one small unit test; the rest stays with the `verify-console-output` skill |
| `utils/tsflow-timing.ts` + `.mjs` | nothing (unset in every profile; the watch spec deletes it) | phase accumulation, `mergeSection` scope nesting, the snapshot-drain contract between the twins, the loader-port timeout, `resetTimings()`, `normalizeFile` folding `file:` URLs and case, report layout | unit (`printTimingReport` already takes a stream) |
| `cli/watch.ts` | one CJS scenario, Enter only; file watching never runs | `onFileEvent` classification; the 200 ms debounce; rerun queued while running; `UNKNOWN_CHANGE`; watcher add and drop; the child argv rewrite and `--no-watch`; quitting mid-run; a failing run not stopping the loop; `formatBytes` | unit after extracting the argv rewrite and the classifier; e2e that edits a file and asserts the `Changed:` line |
| `bindings.ts` / `bindings.mjs` | every workspace imports the entry point | export-name parity between the twins; the root barrel not loading `./cli` | unit |
| `transpilers/esm/loader-utils.mjs`, `esm/esbuild.mjs` | 6 ESM profiles | `isRequire` (a regression breaks every CJS load on sync-hooks Node); resolution caches and their reset; `withoutQuery` against `?tsflow=`; `compilePathMappings` / `rewritePathMappings` | unit for the pure helpers; e2e for the hooks |
| `api/load-configuration.ts` | transpiler switch on every run | env-versus-option precedence for `transpileCache` and `selectiveLoad`; the `parallelLoad` notice | unit (takes an environment object) |
| `utils/our-callsite.ts` | reports on every run, unasserted | `withoutBrowserDetection` restoring the descriptor; `traceLoaderMap` with and without a mapping; cwd-relative `uri` on both separators | unit |

Seams to add before the corresponding tests, each a small extraction rather than a redesign: export the
selective-load matching helpers (`literalPrefix`, `patternKey`, `storedPattern`, `matches`, the first-word
bucketing) out of the 525-line module; an injectable index path or file functions on `SelectiveLoadSession`;
injectable module-graph functions on `SupportReloader`; a clock on `PhaseRenderer` and `StartupProgress`; an
injectable worker factory on `StartupProgress`; `childArgs()` and `isWatchableEvent()` extracted from
`WatchSession`; an injectable `require.cache` for the CJS walkers in `module-graph`; a cwd parameter and a memo
reset for `getCacheRootDirectory()`; a reset for the memoized state in `transpile-cache.ts`, `register-loaders.ts`
and the theme resolution.

### Review findings for strand 2

Recorded before anything changes, one line each, for pruning with the owner. Letters are stable identifiers.

- **A.** `--parallel-load` is still declared (hidden) in `cli/argv-parser.ts` and carried through five type declarations (`argv-parser.ts`, `runtime/types.ts` twice, `api/convert-configuration.ts`, `api/load-support.ts`) for a feature removed in Phase 8; only the notice in `load-configuration.ts` reads it.
- **B.** `IMessageData.coordinates` (`runtime/types.ts`) is still sent to every parallel child and unused there since Phase 4.
- **C.** `TranspileCacheStats.enabled` and `.directory` are produced on every call and read by no caller; `isTimingEnabled()` is exported from both timing twins and called by nobody; `selectiveLoad` is resolved from `TSFLOW_SELECTIVE_LOAD` but, unlike `transpileCache`, not written back to the environment, and the asymmetry is undocumented at the call site.
- **D.** Module eviction and the dependent closure exist twice: `api/load-support.ts` (`evictChangedAndDependents`, `evictAllSupportModules`, CJS only, registry-unaware, what `reload-support-test.feature` tests) and `utils/module-graph.ts` (`dependentProjectModules`, `evictRequiredModules`, what `--watch` uses). `reloadSupport()` never calls `BindingRegistry.clear()` or `notifyReload()`; `SupportReloader.prepare()` does. Highest-value consolidation on the branch. **(large)**
- **E.** Path normalization in four places: `canonicalPath` (`module-graph.ts`), `normalizeFile` (`tsflow-timing.ts`, byte-identical logic), the cwd-prefix strip in `our-callsite.ts`, and ad-hoc backslash replacement in `register-loaders.ts`, `startup-progress.ts` and `loader-utils.mjs`.
- **F.** File stamping in two shapes: `stampOf()` → `[mtimeMs, size]` in `selective-load.ts` and `{ size, mtimeMs }` in the transpile-cache prune scan.
- **G.** Nine caches with no shared policy or reset and no written rule for which participate in the watch-mode reset (only the two resolution caches in `loader-utils.mjs` do, via `addReloadListener`). Document the rule in Architecture.md rather than unify the caches.
- **H.** Two `supports()` with the same name and opposite rules (`transpilers/esbuild.ts` accepts `.ts`, `esm/esbuild.mjs` rejects it), and two `transpileCode()` with the same signature, different `format` defaults and different cache kinds.
- **I.** Two alias-rewriting passes: `rewritePathMappings` over the source (`esm/esbuild.mjs`) and `transformImports` over compiled Vue output (`loader-utils.mjs`), the second running on cached output every time.
- **J.** The decorator mode reaches the transpilers three ways: `global.experimentalDecorators` read at module load (`transpilers/esbuild.ts`), the same global read per call (`vue-sfc-compiler.ts`), and `CUCUMBER_EXPERIMENTAL_DECORATORS` read at module load (`esm/esbuild.mjs`, `esm/tsnode-loader.mjs`). Only the environment form crosses a thread or process boundary, and the Vue cache key is built from the global form, so it is one ordering change away from a stale-cache bug. Pass it as one value. **(large)**
- **K.** `SupportLoadRecorder.endFile(path, kind)` declares two parameters that neither implementation accepts; `composeRecorders` forwards them.
- **L.** The startup phase id is `'assemble'` while every document, comment and theme title calls it "parse".
- **M.** `watch` is the only option that lives on the flat configuration and is read by `Cli.run()` rather than converted into the run configuration; `--no-watch` exists only for the child-process fallback, which no test reaches.
- **N.** The `node` workspace's profile named `watch` does not set `watch: true`; the spec passes `--watch`, so "a profile turns on watch mode" is untested from both ends.
- **O.** `TSFLOW_TIMING` — decided above: keep and test.
- **P.** `bin/cucumber-tsflow.js` enables Node's compile cache, measured neutral in Phase 4; the hand-off called it a review decision. Decide with measurement on the UIS suite or by reading Phase 4's numbers again.
- **Q.** The root `lint` script runs the whole test matrix; make it a lint gate and add `typecheck` beside it.
- **R.** ESLint `no-undef` cannot see the Node global types; `cli/index.ts` and `vue-jsdom-setup.mjs` carry disables. Turn `no-undef` off for TypeScript files and let `tsc` own the check.

Added by the 12a test work (see [Stage 12a hand-off](stage-12a-hand-off.md)); S and T were fixed there because the tests that found them could not otherwise be green:

- **S.** *(fixed in 12a)* `bindings.mjs` and `wrapper.mjs` exported `StartTestCaseInfo`, `EndTestCaseInfo` and `ScenarioContext`, which are interfaces, as runtime values equal to `undefined`; the export-parity test found the three names present in the ESM twins and absent from the CommonJS builds. The lines were removed; a consumer whose tsconfig preserves value imports of these types would now fail at link time instead of receiving `undefined`.
- **T.** *(fixed in 12a)* `patternKey()` in `api/selective-load.ts` keyed a flagless regular expression and a Cucumber expression with the same source identically (`flags ?? ''`), so the second one registered was matched with the first one's compiled expression and its file could be skipped although a selected step matched it. The key now carries the pattern kind.
- **U.** `getSupportCodeLibrary()` leaves eviction to its callers: a second call in one process finds the CommonJS support files cached and builds a library with no step definitions. `reloadSupport()`, `SupportReloader` and the parallel children each handle it in their own way; this is the mechanism behind finding D and a candidate to resolve with it. The unit test `support.test.ts` records the current contract.
- **V.** `SupportLoadRecorder.endFile(path, kind)` declares two parameters that neither implementation accepts (finding K); the unit tests had to call `endFile()` on the classes with no arguments to type-check. Resolving K settles which signature is meant.
- **W.** The fixture support files under `test/fixtures/support/` need a `package.json` with `"type": "commonjs"` (ts-node classifies a `.ts` file's module type from the nearest package scope, and the test tree is `"type": "module"`) and are excluded from `test/tsconfig.json` (their ES import syntax in a CommonJS scope is what the transpiler under test handles); ESLint's project service therefore reports them as not found. The 12d lint pass needs an ESLint configuration for `cucumber-tsflow/test/` that either ignores the fixtures or gives them a project.
- **X.** In the `TSFLOW_TIMING` file-totals table the `main` family counts the main process and its `esm-hooks` scope as two contexts, so `contexts` reads 2 for a serial run with an in-thread loader that reported hook timings. Cosmetic; note whether that is the intended reading when the report layout is next touched.

Added by the 12b failure-path pass (see [Stage 12b hand-off](stage-12b-hand-off.md)); each is classified there as a fix for 12c, a test, or closed:

- **Y.** *(closed)* `--config <absolute path>` fails with `Configuration file "…" failed to load/parse` on Windows and forward-slash forms alike: CucumberJS's `configuration/from_file.js` joins the value onto `cwd` (`path.join(cwd, file)`), so only a cwd-relative path works. Inherited contract; the pass used a configuration file inside the workspace instead.
- **Z.** *(12c fix)* A `BeforeAll` hook that throws is swallowed. `runtime/worker.ts` `runTestRunHook()` catches the error into a FAILED result; `runtime/serial/adapter.ts` only sets `failing` and runs every scenario; `runtime/parallel/worker.ts` awaits `runBeforeAllHooks()` and discards the results. Nothing is printed, no `testRunHookStarted` / `testRunHookFinished` envelope is emitted, and the CLI exits 2 under `3 scenarios (3 passed)`. Upstream 12.7 emits both envelopes and throws `a BeforeAll hook errored, process exiting: <uri>:<line>` with the cause. Fix both adapters, with a spec on a `before-all-throws` fixture.
- **AA.** *(12c fix)* Quitting a watch session whose last run failed to load crashes: `cli/run.ts` reads `global.messageCollector.hasFailures()` and the collector is created only after the support code loads, so the process ends with a `TypeError` stack after `Watch mode stopped.` and exit code 1 where 2 was meant. The session itself survives a failing run and reruns on Enter (CJS and ESM, piped stdin and a real console). Guard the collector, then add the "survives a failing run" scenario, which cannot be green before the fix.
- **AB.** *(12c fix)* A load failure is reported up to five times and breaks the open phase line: esbuild prints its own diagnostic to stderr from inside `transformSync` (`logLevel: 'info'` in `transpilers/esbuild.ts` and `esm/esbuild.mjs`) before `progress.end('failed')` runs, so a console shows `…with es-nodeX [ERROR] Expected ")"…` and the ` failed, 355ms` closing text rows later; `[tsflow:cli]:ERROR` and `[tsflow:run]:ERROR` then repeat the message (three copies on CJS, five on ESM with `[tsflow:esbuild]` and two `[tsflow:esnode-loader]` lines), and watch mode's `runOnce()` prints the stack once more. Set `logLevel: 'silent'` and report once, after the phase line closes.
- **AC.** *(12c fix)* Under the `ts-node-maintained/esm` loader a load error reaches the CLI as an empty null-prototype object: `[tsflow:cli] └─ undefined: undefined`, no file named, exit 1, for a TypeScript compile error and for a missing import alike. Node serializes an error thrown on the hooks thread and ts-node's `TSError` (built with `make-error`) does not survive: a probe saw `typeof 'object'`, no constructor, no keys, and `String()` throwing. Found again with real code the same day: the new step files failed the `tsnodeesm` outer run with this message while the esbuild profiles passed, because that loader type-checks against the workspace `tsconfig.json` (`strict`) and `delete env.TSFLOW_TIMING` on a spread of `process.env` is a strict error; the same line had been in the Phase 10 CJS step file, where the `ts-node` CJS transpiler is transpile-only and never saw it. Catch in `tsnode-loader.mjs` and rethrow a plain `Error` carrying the message and the URL; make `tsflow-logger.error()` and the `Cli.run()` wrappers format non-`Error` throwables; decide whether the CJS / ESM type-check asymmetry is documented or aligned (`TS_NODE_TRANSPILE_ONLY`). A unit test for the logger; the end-to-end form needs a fixture the editor does not flag.
- **AD.** *(12c fix, cosmetic)* A phase that ends in failure closes with the theme's check mark, `[ ✓ ] Packing the jars — … failed, 350ms`, on a real console: `PhaseRenderer.finished()` always uses `theme.mark`.
- **AE.** *(12c decides, cosmetic)* Output from user code during the open launch phase lands on the phase line: `running BeforeAll hooksbeforeAll was called` and then ` 13ms` on the next row, in every plain-mode spec log. Pre-existing since the progress line was added; either close the line before the hooks run or leave it.
- **AF.** *(12c fix, cosmetic)* Under `TSFLOW_ESM_HOOKS=async` the fallback banner names the loader by its specifier (`the @lynxwall/cucumber-tsflow/lib/transpilers/esm/esnode-loader loader runs on Node's loader hooks thread…`) where `describeTranspiler` would say `es-node-esm`.
- **AG.** *(closed, document in 12e)* In the child-process fallback the watcher knows only the feature and support files (`Watching 3 files in 2 directories` against 4 files in 3 directories in process), so an edit to a project module such as `fixtures/scenario-context.ts` does not rerun. By design since Phase 10; the guide should say so.
- **AH.** *(closed)* Ctrl-C: the watch loop treats the `\x03` key (raw-mode stdin, and through a pipe, verified) like `q`. There is no `SIGINT` handler, so a signal (a console Ctrl-C with a non-raw stdin, `kill -INT` on Linux) ends the process with Node's default, without `Watch mode stopped.`, and report files may be partial, as with CucumberJS. Acceptable. Raw-mode restoration on a console whose stdin is a TTY was not observed (the console harness pipes stdin) and rests on `finishQuit()` running before the AA crash, which the `Watch mode stopped.` line on the real console shows.

### 12c triage

Decided with the owner at the start of 12c (2026-09-23), before any refactor. The session was framed as a pruning,
but a finding should only be closed when it is wrong by name and right by design, or when the regression risk
outweighs the benefit and no test can pin it; 12a built the nets, so the second reason barely applies and only
three letters close or defer. Every other letter is a fix, grouped by the vehicle that verifies it, and the groups
are ordered so each leaves the tree green (see [12c: Review refactors](#12c-review-refactors) for the cadence).

| Letter | Disposition | Group | Verified by |
|---|---|---|---|
| A | fix: delete the `--parallel-load` option and its five type declarations | 2 | build, strict type-check, `argv-parser.test.ts` |
| B | fix: drop `IMessageData.coordinates` | 2 | build, strict type-check, parallel spec variants |
| C | fix: delete `TranspileCacheStats.enabled` / `.directory` and both `isTimingEnabled()`; write `selectiveLoad` back to the environment like `transpileCache` or comment why not | 2 | `transpile-cache.test.ts`, `tsflow-timing.test.ts`, selective-load spec |
| D | fix: one eviction and dependent-closure implementation, `reloadSupport()` clearing the registry and notifying listeners like `SupportReloader.prepare()` | 5 | `support.test.ts`, `support-reloader.test.ts`, `reload-support-test.feature`, both watch specs |
| E | fix: one path-normalization helper used by `module-graph.ts`, `tsflow-timing.ts`, `our-callsite.ts`, `register-loaders.ts`, `startup-progress.ts` and `loader-utils.mjs` | 3 | `module-graph.test.ts`, `tsflow-timing.test.ts`, full matrix |
| F | fix: one stamp shape shared by `selective-load.ts` and the transpile-cache prune scan | 3 | `selective-load.test.ts`, `transpile-cache.test.ts` |
| G | moved to 12e: document the cache participation rule in Architecture.md, do not unify the caches | — | owner reads it |
| H | look, then fix: confirm whether the ESM `supports()` rejecting `.ts` is deliberate; align the two `supports()` and the two `transpileCode()` or rename them so the difference is visible | 4 | `transpile-cache.test.ts`, esbuild variants of the matrix |
| I | fix: run `transformImports` before the Vue output is cached, with the path mappings in the cache key | 4 | `transpile-cache.test.ts` (key inputs), Vue variants of the matrix |
| J | fix: one decorator-mode value passed to the transpilers, crossing the thread boundary in one form | 4 | `*-exp*` variants of the matrix, Vue cache-key unit test |
| K / V | fix: settle the `endFile` signature | 2 | `support.test.ts` type-checks without the workaround |
| L | fix: rename the phase id `assemble` to `parse` (one type, one call site, two unit-test lines) | 2 | `startup-progress.test.ts` |
| M | **closed, by design**: the watch loop wraps whole runs, so `watch` is not a property of one run configuration and belongs on the flat configuration read by `Cli.run()`; `--no-watch` is documented in 12e beside AG | — | — |
| N | fix: the `node` workspace's `watch` profile sets `watch: true` and the spec stops passing `--watch`, so "a profile turns on watch mode" is exercised | 5 | `watch-mode-test.feature` |
| O | keep and test, decided at the baseline | — | already covered in 12a |
| P | folded into the closing measurement as one A/B pair (compile cache on and off on the UIS suite) | 6 | the measurement |
| Q, R, W | moved to 12d, where they were already listed | — | `lint` and `typecheck` gates |
| S, T | fixed in 12a | — | — |
| U | fix, with D: `getSupportCodeLibrary()` owns eviction so its callers stop doing it three ways | 5 | as D |
| X | **deferred**: cosmetic; revisit when the timing report layout is next touched | — | — |
| Y, AH | closed in 12b | — | — |
| Z | fix: report a throwing `BeforeAll`, emit both envelopes, fail the run in both adapters | 1 | new `before-all-throws` spec |
| AA | fix: guard `global.messageCollector` in `cli/run.ts` | 1 | new "survives a failing run" watch scenario |
| AB | fix: `logLevel: 'silent'` in both esbuild transpilers, one report after the phase line closes | 1 | load-failure spec asserts one copy; real console |
| AC | fix: rethrow a plain `Error` from `tsnode-loader.mjs`, format non-`Error` throwables in `tsflow-logger.ts`; decide the CJS / ESM type-check asymmetry | 1 | logger unit test with a null-prototype object |
| AD | fix: `PhaseRenderer.finished()` uses a failure mark when the phase failed | 1 | `startup-progress.test.ts`; real console |
| AE | **decided: fix**, close the launch phase line before the `BeforeAll` hooks run so user output starts on its own row | 1 | plain-mode spec logs; real console |
| AF | fix: the async-hooks banner names the loader through `describeTranspiler` | 1 | unit test on the banner text |
| AG | closed in 12b, documented in 12e | — | — |

### Stages and gates

Phase 12 was too large for one gate, so the owner split it into six stages. "Phase 12" stays the umbrella name;
each stage ends with a green gate, a hand-off document beside this one (`stage-12x-hand-off.md`) written like the earlier phases' (state
of the tree, what landed, measured effect, notes for the next stage), and a pause where the owner reads the
hand-off and decides whether to continue. The stages contain everything from the [Phase 12 scope](#phase-12-scope)
plus eight additions raised in the baseline session as "what else belongs in a release gate", all accepted; the
additions are marked **(added)** below.

#### 12a: Test foundation

- The runner: `cucumber-tsflow/test/**/*.test.ts` run by `node --test`; `chai` and `@types/chai` declared on the
  `cucumber-tsflow` workspace at the versions the spec workspaces already use; a `test:unit` script at the root and
  a CI step after `yarn build`.
- Zero-seam unit tests: argv parser, module graph, builder fingerprint, transpile cache, the three cache-key
  strings, timing merge and report, bindings export parity.
- The seams listed under the coverage inventory, then the tests for the scope's risk list: selective-load
  matching and fallbacks (risk 1), transpile-cache invalidation completed (2), `SupportReloader.prepare()` with
  stubbed module-graph (4), `PhaseRenderer` stall and relief with a clock, `getSupportCodeLibrary` twice in one
  process and the `registerLoader` dedupe (6).
- **(added) CI matrix.** The package declares Node `>=22.0.0`, but CI runs Node 24 on Ubuntu only and every
  measurement and manual check on this branch was on Windows. `registerHooks` (Node 22.15) and
  `enableCompileCache` (22.8) may be absent on the declared floor, and the `module.register()` fallback has only
  ever been exercised by hand. Add a matrix of Ubuntu and Windows, Node 22 and 24, and one job with
  `TSFLOW_ESM_HOOKS=async`. CI's `actions/checkout@v2` and `actions/setup-node@v1` are old majors; update them in
  the same edit. This goes first so every later stage is validated on the matrix.

**Gate:** `test:unit` and `test:all` green on the full matrix; every risk 1–6 has a test. **Pause:** the review
findings A–R are pruned with the owner, with the tests open beside them; nothing in 12c is decided before this.

**Status: COMPLETE (2026-09-23), committed as `65d9526`.** See [Stage 12a hand-off](stage-12a-hand-off.md).

#### 12b: Behavior discovery

- Three new spec scenarios: an ESM watch rerun on `node-esm` that edits a support file and asserts the
  `Changed:` line, the `(rerun N: … other modules)` note and a passing rerun (risk 3); a selective-load second run
  asserting `N of M support files … (K skipped)` with a `--no-selective-load` control; a deliberately malformed
  feature in a workspace no other profile globs, for the parse-error path and envelope order (risk 5). Each needs
  the right tags so only the intended workspaces pick it up.
- **(added) Failure-path pass.** In normal and watch mode, on CJS and ESM: a syntax error in a support file, a
  missing import, a `BeforeAll` that throws, a feature that fails to parse, and Ctrl-C mid-run. Check that the
  message names the file, that the spinner worker and the message line shut down cleanly, that stdin leaves raw
  mode, that the exit code is right and that a watch session survives a failing run. This stage finds things
  rather than fixes them: each finding becomes a test, a fix queued for 12c, or a closed entry with a reason.

**Gate:** `test:all` green with the new scenarios on the matrix; no failure-path finding left unclassified.

**Status: COMPLETE (2026-09-23), committed as `47842ca`.** See [Stage 12b hand-off](stage-12b-hand-off.md).

#### 12c: Review refactors

- The triaged findings list (see [12c triage](#12c-triage)), one concern per commit, in six groups ordered so
  each leaves the tree green: (1) the user-visible 12b fixes, each with a spec waiting; (2) dead-code deletions
  with no behavior change; (3) small consolidations of pure helpers; (4) the transpiler layer, H, I then J, which
  share four files; (5) loading and eviction, D/U and N, the largest behavior change, placed last so that if the
  measurement moves the culprit is fresh; (6) the closing measurement.
- **(added) Closing measurement.** After the last refactor, measure the UIS suite (`dim` and the full suite,
  fresh process and one `--watch` rerun) against the Phase 10 clean reference, following the Phase 11 note about
  stray filesystem scanners first. Finding P rides along as one A/B pair with the compile cache on and off.

**Gate:** the findings list fully resolved (landed, moved to a named stage, or closed with a reason); after every
commit, `yarn build`, the strict type-check on the touched files, `yarn test:unit` and the one spec variant that
covers the change; the full `yarn test:all` matrix at every group boundary and before the measurement (the owner
chose this cadence over a full matrix per commit, 2026-09-23: same coverage, far less waiting); the UIS numbers
within noise of Phase 10. **Pause:** the measurement. If it moved, stop and look before touching anything else.

**Status: in progress.** Group 1 (the 12b fixes: AA, Z, AB, AC, AD, AE, AF) landed 2026-09-23 as one squashed commit, `a29eb42`, with the boundary matrix green; group 2 (A, B, C, K/V, L) landed the same day as `7a7af28`, boundary matrix green; A keeps the published `--parallel-load` flag, confirmed by the owner (a minor release removes nothing; see the hand-off); group 3 (E, F) landed the same day as `c57ca3f`, boundary matrix green; group 4 (H, I, J) landed the same day as `1c4299b`, boundary matrix green, followed by `fec46e9`, a fix to Z's spec under async ESM hooks (the source-map relay for `module.register()`, closing the item 28 limitation) made by a second session; group 5 (D/U and N) landed the same day as `85dc327`, boundary matrix green, with the reload-support spec moved into a driver child process (a load now replaces the process's bindings, so the API cannot be called from inside the running suite) and N applied to the `node-esm` watch profiles as well as `node`'s. See [Stage 12c hand-off](stage-12c-hand-off.md). Group 6, the closing measurement, next.

#### 12d: Housekeeping sweeps

- The 21 strict errors, then `strict: true` in `tsconfig.json`; a `typecheck` script covering `src` and `test`;
  the root `lint` script made a lint gate (finding Q); `no-undef` off for TypeScript files (finding R).
- The spelling pass over `src` and the 15 documents: scripted, then read. Identifiers renamed only after checking
  the `exports` map and the spec workspaces. Placed after 12c so renames do not churn under review.
- **(added) Dependency audit.** `import-sync` and `tslib` are imported nowhere under `src` or `bin`; `@types/node`
  is a runtime dependency; `jsdom` is reached only through `jsdom-global`. Decide each: remove, move to
  devDependencies, or keep with a stated reason. `yarn npm audit` in the same pass.

**Gate:** `typecheck` and `lint` clean with no new disables; zero British spellings in `src` and the documents;
every dependency decided.

#### 12e: Documentation and packaging

- `docs/performance-and-diagnostics.md` from the 94-line README block, including **(added) cache operations**:
  where the transpile cache and the selective-load index live, how to clear them, and whether the index is
  bounded the way the transpile cache is (512 MB, oldest first). Document only; a `--clear-cache` flag is new
  feature scope and not part of this phase.
- The root README reduced to one paragraph that links to the guide, with LF corrected to CRLF;
  `cucumber-tsflow/README.md` produced by the build from the root README.
- Architecture.md and CHANGELOG read as one product, not as a sequence of phases.
- **(added) Contributor documentation.** CONTRIBUTE.md still says `yarn test` runs unit tests with chai, which is
  wrong today. Bring it and CLAUDE.md (the command table, the build rules, "things that bite") up to the new
  scripts and the post-refactor shape.
- **(added) Repeatable benchmark script.** A root script that runs one spec workspace under `TSFLOW_TIMING` with
  a fixed profile and prints the report, with reference numbers recorded in the guide. Not a CI gate, since CI
  machines vary; it gives the next person a baseline without the UIS link.
- **(added) Packed-tarball smoke test.** `npm pack` the workspace, install the tarball into a temporary CJS
  project and a temporary ESM project, run one feature in each: the only check of the `exports` map, the
  `bindings/index.d.ts` stub and type resolution as a consumer sees them, and of the `files` list leaking nothing
  dev-only.

**Gate:** the tarball runs a feature in fresh CJS and ESM projects; the owner has read the guide and the README
paragraph; CONTRIBUTE.md and CLAUDE.md match the scripts.

#### 12f: Release

- **(added) Release checklist**, written before this stage starts: the version decision (the `[Unreleased]`
  section deprecates but removes nothing, which reads as a minor release, but the scenario-context lookup change
  under "Changed" is a behavior change the owner should weigh), the CHANGELOG date and heading, the tag, and how
  publish runs (`@jsdevtools/npm-publish` is in the root devDependencies; check for a publish workflow).
- **(added)** Real-console verification of the startup output with the `verify-console-output` skill, after the
  `colour` → `color` renames in `utils/startup-progress.ts`.
- A final `test:all` on the matrix, then tag and publish.

**Gate:** the checklist has no open box.

### Exit criteria, amended

The [exit criteria](#exit-criteria) above stand, gathered here with the additions: `yarn build` clean; `yarn
test:unit` and `yarn test:all` green on the Ubuntu and Windows, Node 22 and 24 matrix including the
`TSFLOW_ESM_HOOKS=async` job; `typecheck` clean with `strict` on; `yarn lint` clean without new disables; no
British spellings in `cucumber-tsflow/src` or the root and research documents; the review findings list fully
resolved; the failure-path pass with no open finding; the UIS closing measurement within noise of the Phase 10
reference; `docs/performance-and-diagnostics.md` exists and the root README's only performance content is the
paragraph that links to it; `cucumber-tsflow/README.md` byte-identical to the root README after `yarn build`;
Architecture.md, README, CHANGELOG, CONTRIBUTE.md and CLAUDE.md describe the product as it ships; the packed
tarball runs a feature in a fresh CJS and a fresh ESM project; the startup output verified on a real console; the
release checklist complete.
