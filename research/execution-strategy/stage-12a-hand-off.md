# Stage 12a hand-off

Part of the [Performance Enhancement Execution Strategy](../performance-enhancement-execution-strategy.md).

Written at the end of the 12a session (2026-09-22) so that the pause and 12b can start cold. Stage 12a is the test
foundation described under [Stages and gates](phase-12-plan.md#stages-and-gates): the unit-test runner, the seams, the unit tests for
the risk list, and the CI matrix.

## State of the tree

- Branch `2026-09-speed-enhancements`. The Phase 12 baseline written in the previous session (decisions, coverage
  inventory, findings A–R, the six stages) is committed as `4604940`. The 12a work is committed as `65d9526` ("Stage
  12a: unit-test foundation, seams, risk-list tests and CI matrix") after the owner's review on 2026-09-23; the tree
  was clean after it, and 12b starts from there. On that build: `yarn build` clean, no stray `.js` under `src/`;
  `yarn test:unit` green (218 tests in 16 files, about 1.6 s on this machine); `yarn test:all` green on all sixteen
  variants, with the scenario counts unchanged since Phase 10 (18, 18, 20, 20, 18, 18, 15, 15, 30, 30, 30, 30, 31,
  31, 27, 27).
- `npx tsc -p test/tsconfig.json` (from `cucumber-tsflow/`) is clean with `strict`, `verbatimModuleSyntax` and
  `erasableSyntaxOnly` on. `npx tsc --noEmit -p tsconfig.node.json --strictNullChecks` reports nothing in the touched
  source files (the pre-existing 21 errors stand). `npx eslint cucumber-tsflow/src` is unchanged (0 errors, the
  generated `version.ts` warning); `npx eslint cucumber-tsflow/test` passes every test file and fails only on the two
  fixture support files (finding W). Prettier is clean on every file added or touched, all CRLF.
- Files added: `cucumber-tsflow/test/` — `package.json` (`"type": "module"`), `tsconfig.json`, `helpers/temp.ts`,
  `fixtures/timing-worker.mjs`, `fixtures/support/{package.json,steps-a.ts,steps-b.ts}`, and the test files
  `cli/argv-parser`, `utils/module-graph`, `utils/tsflow-timing`, `utils/startup-progress`, `api/builder-fingerprint`,
  `api/selective-load`, `api/support-reloader`, `api/support`, `api/run-cucumber`, `api/register-loaders`,
  `api/load-configuration`, `transpilers/transpile-cache`, `transpilers/cache-keys`, `transpilers/esm/loader-utils`,
  `bindings-exports` and `bindings-light` (all `*.test.ts`; about 2700 lines with the fixtures).
- Files changed: `src/transpilers/transpile-cache.ts` (`getCacheRootDirectory(cwd)`, memoized per working directory;
  `resetTranspileCacheDirectory()`), `src/api/selective-load.ts` (`storedPattern`, `patternKey`, `literalPrefix` and
  `StoredPattern` exported; an optional `indexDirectory` constructor parameter; the finding T fix),
  `src/utils/startup-progress.ts` (a `now` clock on `PhaseRenderer`; `StartupProgressOptions` with `now`,
  `createWorker` and `handshakeTimeoutMs`; `SpinnerWorkerHandle`, the part of a `Worker` the class uses),
  `src/api/register-loaders.ts` (`registeredLoaders()`, read-only), `src/bindings.mjs` and `src/wrapper.mjs` (finding
  S), `cucumber-tsflow/package.json` (`chai` and `@types/chai` as devDependencies at the spec workspaces' versions;
  the `test:unit` script), `cucumber-tsflow/tsconfig.json` (`./test` excluded so the base configuration keeps
  describing `src`), the root `package.json` (`test:unit`), `yarn.lock`, `.github/workflows/ci.yml` (the matrix),
  `CLAUDE.md` (the command table and the note on where the tests are), `CHANGELOG.md` (two `Fixed` entries for S and
  T) and the execution strategy.

## What 12a landed

- **The runner.** `yarn test:unit` runs `node --test "test/**/*.test.ts"` in the `cucumber-tsflow` workspace: Node's
  built-in runner over TypeScript test files that Node strips itself, one process per file, importing the built
  `lib/` (so `yarn build` first, as for every other test script) and asserting with `chai`. The test tree is an ES
  module scope of its own (`test/package.json`), which is why the fixtures that must load as CommonJS carry a
  `package.json` of their own. `test/tsconfig.json` type-checks the tests as the editor sees them: `strict`,
  `nodenext`, `allowJs` so the `.mjs` twins have types, `verbatimModuleSyntax` and `erasableSyntaxOnly` so nothing
  Node cannot strip gets in. CJS modules are imported by their default (the module object) and destructured, which is
  what Node's interop gives and what TypeScript types; types come from `lib/*.d.ts`, never from CucumberJS's deep
  paths, which `nodenext` refuses to resolve from an ESM file.
- **The seams**, kept to what the tests needed: the cache root takes a working directory and can be reset, so the
  `node_modules` → `package.json` → temp directory walk is tested on temp trees; the selective-load session takes an
  index directory, so a test never touches the project's index; the renderer and the progress class take a clock, so
  the 30-second heartbeat, the stall and the five-unit relief streak are tested in milliseconds; the progress class
  takes a worker factory and a handshake timeout, so the end handshake and its fallback are tested without a thread;
  `register-loaders` exposes what it has attached. Not added, and why: an injectable `require.cache` for the
  module-graph walkers and a stubbed module graph for `SupportReloader`, because real temporary CommonJS files
  required through `createRequire` and real recorded ESM edges test the same code paths with nothing faked; the
  `childArgs()` / `isWatchableEvent()` extractions from `WatchSession`, because `cli/watch.ts` is 12b's end-to-end
  ground and its unit seams can wait for what 12b finds.
- **The tests against the risk list.** (1) `selective-load.test.ts` drives `SelectiveLoadSession` through eleven
  consecutive runs over one index: first run, matching by Cucumber expression and by global regular expression, a step
  registered straight with CucumberJS, hooks and set-up files always loading, every-file-needed, no-match full plan
  with the step text in the reason, a new file, a pattern that does not compile, a changed import graph and the
  rewritten record afterwards, a skipped file's record surviving, parameter types recorded and used, a corrupt index,
  `abort()` writing nothing, plus a `literalPrefix` table and the "never excludes a matching text" check.
  (2) `transpile-cache.test.ts` covers hit, miss on each input, field boundaries in the key, entries of another format
  or without a value, an unwritable directory, the `TSFLOW_TRANSPILE_CACHE=false` bypass, pruning order with a stray
  temp file, and the directory walk; `cache-keys.test.ts` checks that each of the three transpilers' key strings
  changes with every input it promises to cover, including the decorator mode read three different ways (finding J,
  now with a test on each way). (3) Watch mode's versioning, eviction and reverse closure are covered in
  `module-graph.test.ts` and `support-reloader.test.ts`; the second and third run end to end, on ESM, stay with 12b as
  planned, with the existing CommonJS watch spec covering the CJS side. (4) `support-reloader.test.ts` runs one
  reloader through ten generations: observe-only first run, re-evaluate what registered, a changed module and its
  requirers, a new file, registration seen through the builder alone, a file dropping back to kept, a
  decorator-applying helper re-evaluated every run, a late registration noticed at the next `prepare()`, `abort()`
  forgetting a changed file, and `watchedFiles()`; plus the ESM `?tsflow=<n>` versioning and `unsupportedReason`.
  (5) `run-cucumber.test.ts` runs `runCucumber` in-process on the es-node transpiler with the fixture support files
  and checks the envelope order (`meta`, `source`, `gherkinDocument`, `pickle`, then the support code, then the run)
  and the parse-error path (support loaded, `parseError` emitted, nothing run, `success: false`). (6) `support.test.ts`
  loads the decorated fixtures through ts-node twice with eviction in between and asserts an equal library, records
  the no-eviction behavior (finding U), and checks the registry's callsite patching through real source maps;
  `register-loaders.test.ts` covers the `loaderHooksMode` truth table and attaches a loader twice.
- **The zero-seam tests.** `argv-parser` (the paired `--x` / `--no-x` declarations, collectors, tag merging, JSON
  merging and its errors, count validation, the hidden `--parallel-load`), `module-graph` (canonical paths on both
  platforms, `isProjectModule` including the library-root and sibling cases, recorded edges with cycles, the reverse
  closure over both module systems on real temp files, versioning with foreign and stale queries, edge forgetting,
  reload listeners), `builder-fingerprint` (each of the six fields), `tsflow-timing` (accumulation, nested scopes,
  snapshot copies, the report layout, file identity folding across URL, separator and case, and the loader-port
  contract against a real worker thread including the drain and the timeout), `startup-progress` (both renderer modes,
  the heartbeat and relief state machine, message self-clear, row counting with emoji and escapes, the width used for
  the cursor-up count, `describeTranspiler` for all eight names, themes, `plural`), `load-configuration`
  (environment-versus-option precedence for both options, the `parallelLoad` notice from either source, decorator
  mode publication, the transpiler switch, format aliases, path clearing), `loader-utils` (`isRequire`, extension
  probing and its cache reset, common file types, `loadTypeScript` keeping its map, the hooks' require passthrough,
  edge recording and version application), and the two export-parity files (twins equal by name and value, the root a
  superset of `bindings`, the CLI not loaded by the root, nothing heavy loaded by `bindings` alone).
- **The CI matrix.** `ci.yml` now runs Ubuntu and Windows × Node 22 and 24, plus one Ubuntu/Node 24 job with
  `TSFLOW_ESM_HOOKS=async` (declared through a `hooks` matrix dimension so the `include` entry is a fifth job rather
  than a merge into an existing one), on `actions/checkout@v4` and `actions/setup-node@v4`, with `yarn test:unit`
  between the build and the spec matrix and `fail-fast: false`. A `workflow_dispatch` trigger was added so the
  matrix can be run by hand on this branch: the workflow's push and pull-request triggers are still `master` and
  `release/**` only, so **the matrix has been written but not yet executed**; nothing in this session ran on GitHub.
  Two things to watch when it first runs: the unit tests need Node's default type stripping, which arrived in 22.18,
  so `node-version: '22'` must keep resolving to a current 22.x (it does today); and the async job sets the variable
  to an empty string on the other jobs, which every reader compares with `=== 'async'`.
- **Found on the way, fixed, with tests as the net:** findings S and T above, both in the `CHANGELOG` under `Fixed`.
  Found and recorded for the pause: U, V, W, X.

## Notes specific to the pause and 12b

- The gate is met as far as this machine can tell: `test:unit` and `test:all` green here, every item on the risk
  list has a test, with 3 (ESM watch reruns end to end) and 5's end-to-end form deliberately left to 12b's scenarios.
  The owner reviewed and approved the tree on 2026-09-23 without changes. The pruning of findings A–X did not happen
  in that review; 12b does not depend on it, and it stays the first thing 12c needs.
- Running one test file: `node --test test/api/selective-load.test.ts` from `cucumber-tsflow/` after `yarn build`.
  Each file is its own process, so module-level state (the timing store, the module graph, the transpile-cache
  directory, the binding registry) is isolated between files but shared within one; the files that depend on order
  say so in comments. Temp directories come from `test/helpers/temp.ts` and are removed when the file ends.
- Two files use the project's real transpile cache under `node_modules/.cache/cucumber-tsflow/transpile`, because
  they load the fixtures through the es-node transpiler like a real run: `api/support.test.ts` and
  `api/run-cucumber.test.ts`. Every other transpile in the tests is redirected with `TSFLOW_TRANSPILE_CACHE_DIR`.
- `register-loaders.test.ts` really attaches the esnode loader to its process (in-thread here, on the hooks thread
  under the async CI job), which is why that test is last in its file.
- For 12b's scenarios: `run-cucumber.test.ts` shows how to drive a whole run in-process with a captured stdout and
  the envelope stream, which may be a quicker vehicle for the parse-error ordering check than a spec workspace; the
  stage text asks for a spec scenario in a workspace no other profile globs, and that remains the plan for the
  user-visible form.
- Build with `yarn build`, never bare `tsc`; run `yarn test:unit` and `yarn test:all` before calling a stage done.

## Starting 12b

Written for a fresh session, so that it can start without re-deriving anything. 12b is
[Behavior discovery](phase-12-plan.md#12b-behavior-discovery): three end-to-end scenarios and a failure-path pass. It finds things
and records them; fixes go to 12c.

- **Read first:** [Phase 12 scope](phase-12-plan.md#phase-12-scope), the [12b stage text](phase-12-plan.md#12b-behavior-discovery), this hand-off (the
  runner, the seams and what each test file already covers), and the
  [Phase 10 hand-off](phase-10-hand-off.md) for what watch mode promised and how its spec drives the CLI. The
  `coverage inventory` rows for `api/run-cucumber.ts`, `cli/watch.ts` and `api/support-reloader.ts` list the
  behaviors that still have only end-to-end or no coverage.
- **Start state:** branch `2026-09-speed-enhancements` at `65d9526`, clean. `yarn`, `yarn build`, then
  `yarn test:unit` (218 green) and `yarn test:all` (sixteen variants green) reproduce the 12a gate. Build with
  `yarn build`, never bare `tsc`.
- **Scenario 1, ESM watch rerun (risk 3).** The existing spec is [watch-mode-test.feature](../../cucumber-tsflow-specs/features/watch-mode-test.feature)
  with its steps in `cucumber-tsflow-specs/node/src/step_definitions/watch-mode-test.ts` (a `WatchSession` class that
  spawns `bin/cucumber-tsflow.js -p <profile> --watch` through piped stdin, waits for each `Run took` line, and
  quits with `q`). It runs on the `node` workspace's `watch` profile and is tagged `@watch @node`. The ESM version
  needs: a `watch` profile in `cucumber-tsflow-specs/node-esm/cucumber.json` (transpiler `es-node-esm`, one feature,
  two support files, `format: ["progress"]`, `parallel: 0`), a copy of the steps in the `node-esm` workspace
  (the CJS steps use `require.resolve` for the bin path; the ESM copy needs `createRequire` or `import.meta.resolve`),
  a feature tagged so only `node-esm` runs it (`@node-esm`, and check the `tsnodeesm` profile's tag expression
  `@node-esm and not @reload`: under `ts-node-maintained/esm` watch mode falls back to a child process per run, so
  either exclude the scenario from that profile with a tag or write a second scenario asserting the fallback banner
  `Support code cannot be kept loaded between runs`). The scenario edits a support file between runs (append a
  comment, then restore it in an `@after` hook), and asserts the `Changed: <relative path>` line, the
  `(rerun N: A evaluated again, B kept loaded, C other modules)` note and `N scenarios (N passed)` on the rerun.
  Watch debounce is 200 ms; the file event may arrive twice (editors write twice), which the loop coalesces.
- **Scenario 2, selective-load second run.** `selectiveLoad: true` is already set on the `esnode` (node),
  `esnodeesm` (node-esm) and the corresponding Vue profiles. A second run of a filtered profile prints
  `N of M support files … (K skipped: not used by the selected scenarios)` in the load-phase line (plain text when
  stdout is not a TTY, with `TSFLOW_THEME` at its default). The control is the same profile with
  `--no-selective-load`, whose line reads `M support files` with no skip note. The index lives under
  `node_modules/.cache/cucumber-tsflow/selective-load`, keyed on cwd, coordinates, decorator mode and version, so the
  scenario must run the CLI twice itself (first run writes the index) or point `TSFLOW_TRANSPILE_CACHE_DIR` nowhere
  (the index does not follow that variable; it follows `getCacheRootDirectory()`, which is the workspace's
  `node_modules`). A child-process step file in the `node` workspace, tagged `@node` only, is the simplest home;
  on CI every run is cold, so the scenario is the only thing that ever exercises the warm path there.
- **Scenario 3, parse error and envelope order (risk 5).** `api/run-cucumber.test.ts` already covers the order and
  the parse-error path in-process (`meta`, `source`, `gherkinDocument`, `pickle`, then support, then the run;
  on a parse error the support code loads, `parseError` is emitted, nothing runs, `success` is false, stderr says
  `Parse error in`). The stage text wants the user-visible form: a malformed feature in a directory no other profile
  globs (every profile globs `../features/**/*.feature`, so it must live outside `cucumber-tsflow-specs/features/`,
  for example `cucumber-tsflow-specs/node/src/fixtures/broken/`), run through the CLI by a step, asserting the
  `1 parse error` phase summary, the `Parse error in "<uri>"` message and exit code 2. Two `Feature:` lines in one
  file is a reliable parse error; free text under a scenario is only a description.
- **Failure-path pass.** No test for these exists yet; the pass is manual first, then each finding becomes a test, a
  12c fix or a closed entry. Drive the CLI as the watch spec does (child process, piped stdin, captured stdout and
  stderr, exit code). Cases: a syntax error in a support file, a missing import, a `BeforeAll` that throws, the
  malformed feature, and Ctrl-C mid-run (`child.kill('SIGINT')` on Linux; on Windows a piped stdin cannot deliver
  Ctrl-C, so send `q` in watch mode and use `child.kill()` for the plain run). Check on each: the message names the
  file, the spinner worker and message line shut down (no stray escape sequences after the error, the process exits
  on its own), stdin leaves raw mode (only observable on a real console: use the `verify-console-output` skill for
  that one), the exit code (2 for a failed run, 3 when implemented steps failed, 1 for a CLI error), and that a watch
  session survives a failing run and reruns on Enter. `progress.finish()` on the failed-load path was added in Phase
  10 and is the code under test for the spinner shutdown.
- **What not to do in 12b:** no refactors (12c), no spelling or strict-mode sweeps (12d), no documentation beyond
  this file (12e). Findings go into the strand 2 list with the next letters (Y onward) and into the 12b hand-off.
- **Gate and hand-off:** `yarn test:all` green with the new scenarios on the matrix (run the CI workflow by hand on
  the branch; it has a manual trigger and does not fire on this branch's pushes); no failure-path finding left
  unclassified; a `stage-12b-hand-off.md` document beside this one in the shape of the 12a one.
