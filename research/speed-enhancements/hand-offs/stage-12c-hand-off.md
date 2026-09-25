# Stage 12c hand-off

Part of the [Performance Enhancement Execution Strategy](../performance-enhancement-execution-strategy.md).

Written as the groups land (started 2026-09-23), so that a pause after any group can resume cold. Stage 12c is
[Review refactors](../plan/phase-12-plan.md#12c-review-refactors): the triaged findings in six groups, one concern per commit. **All six groups are complete and the stage is closed (2026-09-24).**

## State of the tree

- Branch `2026-09-speed-enhancements`, started from `1c842e6` (the triage commit). Group 1 is one commit,
  `a29eb42`, squashed on 2026-09-23 from seven working commits, one per finding, in the order the plan gave (AA,
  Z, AB, AC, AD, AE, AF). The tree was clean after each working commit; the cadence held after every one (`yarn
  build`, the strict type-check filtered to the touched files with zero errors from them, `yarn test:unit`, and
  the one spec variant covering the change), and the full `yarn test:all` ran once at the group boundary.
- On `a29eb42` (the same tree as the last working commit): `yarn build` clean, no stray `.js` under `src/`;
  `yarn test:unit` green, **238 tests** (218 at the
  start of the stage; the new file is `test/utils/tsflow-logger.test.ts`, and `startup-progress.test.ts`,
  `support-reloader.test.ts` and `selective-load.test.ts` gained cases); `yarn test:all` green on all sixteen
  variants, counts 18, 18, **31, 31**, 18, 18, **25, 25**, 30, 30, 30, 30, 31, 31, 27, 27 (the `node` workspace was
  25 and `node-esm` 18 after 12b; the other twelve are unchanged since Phase 10). The draft pull request's CI
  matrix first saw group 1 when `a29eb42` and `05f76cf` were pushed at the start of the group 2 session.
- Files added: `cucumber-tsflow/test/utils/tsflow-logger.test.ts`; the features `watch-mode-failure-test.feature`,
  `before-all-throws-test.feature`, `syntax-error-test.feature`, `syntax-error-raw-loader-test.feature` (all
  `@node @node-esm` except the last, `@node-esm` only) and `startup-phases-test.feature`; the fixture
  `src/fixtures/failing/before-all-throws.ts` in both `node` and `node-esm`. Profiles added to both workspaces'
  `cucumber.json`: `before-all-throws`, `syntax-error`, `syntax-error-tsnode`, `basic`; `node-esm` also has
  `syntax-error-raw-loader` (`loader: ts-node-maintained/esm`). Both workspace tsconfigs exclude
  `src/fixtures/failing/generated`, and `.gitignore` covers that directory: the syntax-error specs write their
  broken fixture there for one run and delete it in the `@after` hook, so no file with a syntax error ever sits
  in the tree for the editor to flag.
- Files changed under `src`: `cli/run.ts`, `cli/index.ts`, `cli/watch.ts`, `api/run-cucumber.ts`,
  `api/support.ts`, `api/support-reloader.ts`, `api/selective-load.ts`, `runtime/worker.ts`,
  `runtime/serial/adapter.ts`, `runtime/parallel/worker.ts`, `utils/tsflow-logger.ts` and `.mjs`,
  `utils/startup-progress.ts`, `utils/startup-progress-worker.ts`, `transpilers/esbuild.ts`, and the ESM loaders
  `esbuild.mjs`, `loader-utils.mjs`, `vue-loader.mjs`, `tsnode-loader.mjs`, `vue-jsdom-setup.mjs`. Each fix has
  its line under `Fixed` in the CHANGELOG's `Unreleased` section.
- **Group 2** (A, B, C, K/V, L; dead-code deletions, no behavior change) is one commit, `7a7af28`, squashed on
  2026-09-23 from five working commits, one per finding, on top of the document split `05f76cf`. The cadence held
  after each working commit (`yarn build` with no stray `.js` under `src/`, the strict type-check with zero errors
  from the touched files, `yarn test:unit` at **238 tests**, and `yarn test:node:cjs-esbuild` at 31 of 31; for K/V
  also `tsc --noEmit -p test/tsconfig.json`, which is the check the finding named). At the group boundary
  `yarn test:all` was green on all sixteen variants: 18, 18, 31, 31, 18, 18, 25, 25, 30, 30, 30, 30, 31, 31, 27, 27, identical to the group 1 boundary. No spec changes, as the plan said.
- Group 2 files changed under `src`: `cli/argv-parser.ts`, `api/convert-configuration.ts`, `api/load-support.ts`,
  `api/load-configuration.ts`, `api/support.ts`, `api/run-cucumber.ts`, `runtime/types.ts`,
  `runtime/make-runtime.ts`, `runtime/parallel/adapter.ts`, `transpilers/transpile-cache.ts`,
  `utils/tsflow-timing.ts` and `.mjs`, `utils/startup-progress.ts`. Tests: `transpile-cache.test.ts`,
  `tsflow-timing.test.ts`, `support.test.ts`, `startup-progress.test.ts`. Also `Architecture.md` (the phase list
  and the unit-of-work table), one CHANGELOG clause (B), and the console-verification skill's
  `scripts/child-template.js` (L).
- **Group 3** (E, F; two helper consolidations, no behavior change intended) is one commit, `c57ca3f`, squashed on
  2026-09-23 from two working commits, one per finding, on top of the hand-off commit `8cc62fc`; the tree is
  byte-identical to the last working commit. The cadence held after each (`yarn build` with no stray `.js` under
  `src/`, the strict type-check with zero errors from the touched files and the pre-existing total unchanged at
  21, `tsc --noEmit -p test/tsconfig.json` clean, `yarn test:unit` at **246 tests** after E's five new cases and
  F's three, and `yarn test:node:cjs-esbuild` at 31 of 31). At the group boundary `yarn test:all` was green on all
  sixteen variants: 18, 18, 31, 31, 18, 18, 25, 25, 30, 30, 30, 30, 31, 31, 27, 27, identical to the group 2
  boundary. No spec changes, as the plan said.
- Group 3 files added: `src/utils/paths.ts`, `src/utils/file-stamp.ts`, `test/utils/paths.test.ts`,
  `test/utils/file-stamp.test.ts`. Changed under `src`: `utils/module-graph.ts`, `utils/tsflow-timing.ts`,
  `utils/our-callsite.ts`, `utils/startup-progress.ts`, `api/register-loaders.ts`, `api/selective-load.ts`,
  `api/support-reloader.ts`, `cli/watch.ts`, `transpilers/transpile-cache.ts`, `transpilers/esm/loader-utils.mjs`.
  Tests changed: `module-graph.test.ts` (three describe blocks moved to `paths.test.ts`),
  `support-reloader.test.ts` and `loader-utils.test.ts` (import `canonicalPath` from its new home). No CHANGELOG
  line: nothing a user sees changed.
- **Group 4** (H, I, J; the transpiler layer) is one commit, `1c4299b`, squashed on 2026-09-23 from three
  working commits, one per finding in the plan's order, on top of the group 3 hand-off `358f6e8`; the tree is
  byte-identical to the last working commit. The cadence held after each (`yarn build` with no stray `.js`
  under `src/`, the strict type-check with zero errors from the touched files and the pre-existing total still
  21, `tsc --noEmit -p test/tsconfig.json` clean, `yarn test:unit`, and the variants the triage named: the four
  esbuild variants after H at 31, 25, 18, 18; the four Vue variants after I at 18 each; the eight `*-exp*`
  variants after J at 31, 31, 27, 27, 30, 30, 30, 30). At the group boundary `yarn test:all` was green on all
  sixteen variants: 18, 18, 31, 31, 18, 18, 25, 25, 30, 30, 30, 30, 31, 31, 27, 27, identical to the group 3
  boundary. `yarn test:unit` is at **260 tests** (252 after group 4's own eight: `esbuild.test.ts` five,
  `decorator-mode.test.ts` two, `loadVue` one; the other eight are the Z fix's below).
- Group 4 files added: `src/utils/decorator-mode.ts`, `test/transpilers/esbuild.test.ts`,
  `test/utils/decorator-mode.test.ts`. Deleted: `src/transpilers/esm/vue-sfc-compiler.mjs`. Changed under
  `src`: `transpilers/esbuild.ts`, `transpilers/esm/esbuild.mjs`, `transpilers/vue-sfc-compiler.ts`,
  `transpilers/esm/loader-utils.mjs`, `transpilers/esm/tsnode-loader.mjs`, `api/load-configuration.ts`,
  `runtime/parallel/worker.ts`. Tests changed: `cache-keys.test.ts`, `loader-utils.test.ts`. Also
  `Architecture.md` (the transpile-cache paragraph, the configuration bullet on the decorator mode). No
  CHANGELOG line for H, I or J: nothing a user sees changed; the transpile-cache entries written by earlier
  builds of this branch become garbage under the new kinds and keys, pruned by size like any other.
- **Z fix, source-map relay for `module.register()`**, is the commit `fec46e9` on top of `1c4299b`, made by a
  second session working in the same tree during the group 4 session (see the coordination note under the
  notes below). It closes the CI failure in the "Ubuntu, Node 24, async ESM hooks" job on the `before-all-throws`
  spec and the Phase 6 item 28 limitation ("esbuild loaders under `TSFLOW_ESM_HOOKS=async` still report raw
  positions"). Files: `src/api/register-loaders.ts`, `src/utils/our-callsite.ts`, `src/utils/loader-source-maps.ts`
  (new), `src/transpilers/esm/source-map-relay.mjs` (new), `src/transpilers/esm/esnode-loader.mjs`,
  `src/transpilers/esm/esvue-loader.mjs`, `test/utils/loader-source-maps.test.ts` (new),
  `test/transpilers/esm/source-map-relay.test.ts` (new). The group 4 boundary matrix ran against a `lib/` built
  from a working tree whose content equals `fec46e9`, so it covers this commit too. Its CHANGELOG clause was
  added to the existing "Step definitions loaded by the esbuild ESM loaders report their TypeScript line" entry,
  and its Architecture.md sentence to the callsite source-map paragraph, in the hand-off commit.
- **Group 5** (D/U and N; loading and eviction, the largest behavior change of the stage) is one commit,
  `85dc327`, squashed on 2026-09-23 from two working commits (D/U with the spec move and the documents, then N)
  on top of the group 4 hand-off `0183162`; the tree is byte-identical to the last working commit. The cadence
  held after each (`yarn build` with no stray `.js` under `src/`, the strict type-check with zero errors from
  the touched files and the pre-existing total still 21, `yarn test:unit` at **261 tests**, Prettier and ESLint
  on the changed files, the three changed spec workspaces' `tsc --noEmit`, and the variants the triage named:
  the reload spec on `node` es-node and `node-exp` es-node with `parallel: 2`, the two `node` watch specs, the
  two `node-esm` watch specs including the `watch-tsnode` fallback). At the group boundary `yarn test:all` was
  green on all sixteen variants: 18, 18, 31, 31, 18, 18, 25, 25, 30, 30, 30, 30, 31, 31, 27, 27, identical to the
  group 4 boundary (the reload feature still has four scenarios; its fourth changed in substance rather than in
  number). `tsc --noEmit -p test/tsconfig.json` reports four errors, all in the Z fix's two test files, none in
  group 5's; see the notes.
- Group 5 files added: `cucumber-tsflow-specs/node/src/fixtures/reload-driver.ts` and `reload-fixture-two.ts`,
  and the same two under `node-exp`. Changed under `src`: `api/support.ts`, `api/support-reloader.ts`,
  `api/load-support.ts`, `api/run-cucumber.ts`, `runtime/parallel/worker.ts`. Tests changed: `support.test.ts`,
  `support-reloader.test.ts`. Specs changed: `reload-support-test.feature`, `watch-mode-test.feature`,
  `watch-mode-esm-test.feature`, `watch-mode-failure-test.feature`; `reload-support-test.ts` and
  `watch-mode-test.ts` in `node`, `reload-support-test.ts` in `node-exp`, `watch-mode-test.ts` in `node-esm`;
  `cucumber.json` in `node` and `node-esm`. Also `Architecture.md` (a new "Loading support code" section, the
  watch-mode paragraph, the loader-registration sentence, the API list), both READMEs' `reloadSupport`
  paragraph, and the CHANGELOG (one `Fixed` entry for `reloadSupport`, one `Changed` line for the parallel child).
- **Group 6** (the closing measurement, 2026-09-24) changed no source; it is the documentation commit on top of
  `6920b17`: this document, the strategy map, the 12c status line and finding P's triage row in
  `phase-12-plan.md`, the discard rule and the watch-driver reference in `local-consumer-testing.md`, and
  `research/scripts/watch-driver.js`, the piped-stdin driver the watch-mode measurements were taken with (Phase
  10's was a scratch script that was never committed). The logs are under `research/profiles/12c-closing/`,
  gitignored like the earlier series. `lib/` was built from `972d5b9` at the start of the session (clean, no stray
  `.js` under `src/`); the boundary matrix was not rerun, since the only commit after the group 5 boundary changed
  one declaration file in the test program. A peer session worked in the same tree during this one and landed
  `6920b17` ("12e (early): ship an agent skill with the package, and keep it in sync") between `972d5b9` and this
  commit, with the owner's go-ahead: the shipped agent skill under `cucumber-tsflow/skills/`, its `files` entry in
  `cucumber-tsflow/package.json`, the maintenance rule in CLAUDE.md, CONTRIBUTE.md and
  `.github/copilot-instructions.md`, and additions to the 12d to 12f sections of `phase-12-plan.md`. It touches no
  source, test or spec file and is independent of group 6; its two `yarn build` runs in the tree (same TypeScript,
  a regenerated `version.ts`) overlapped only runs this measurement had already discarded as disturbed.

## What group 1 landed

- **AA.** `cli/run.ts` reads `global.messageCollector?.hasFailures()`: the collector exists only once the support
  code has loaded, so quitting a watch session after a failed load no longer crashes with a `TypeError` and exits
  2, not 1. Spec: `watch-mode-failure-test.feature` on the `missing-import` profile (first run fails, Enter reruns,
  `q`, exit 2, nothing printed after `Watch mode stopped.`); it was red before the fix.
- **Z.** `runtime/worker.ts` runs test-run hooks the way CucumberJS 12.7's worker does: `testRunHookStarted` and
  `testRunHookFinished` envelopes, the hook under its timeout (previously ignored for `BeforeAll`/`AfterAll`)
  and inside `runInTestRunScope` (so the `context` proxy works in a hook), `formatError` for the result, and an
  `Error` `a BeforeAll hook errored[ on worker N], process exiting: <uri>:<line>` with the hook's error as its
  cause, thrown from `runBeforeAllHooks` / `runAfterAllHooks`. The `Worker` constructor takes `testRunStartedId`
  first, as upstream's. The serial adapter lets it propagate (CLI exit 1); the parallel child rejects its
  `INITIALIZE` command, `run-worker.ts` prints the chain and exits 1, and the coordinator counts the run as
  failed (exit 2). `runCucumber` closes the phase line on the way out. Spec: `before-all-throws-test.feature`,
  serial and `--parallel 1`, asserting `before-all-throws.ts:9` (the decorator line), the hook's own message and
  the exit code.
- **AB.** One report per failure. `logLevel: 'silent'` in `transpilers/esbuild.ts` and `esm/esbuild.mjs`; the
  fourteen `logger.error` calls in the ESM loaders that preceded a rethrow are verbose-only checkpoints now
  (`loader-utils.mjs` ×9, `esbuild.mjs`, `tsnode-loader.mjs`, `vue-loader.mjs` ×3, `vue-jsdom-setup.mjs` ×2; the
  seven that swallow an error and continue still report); `Cli.run()` no longer logs before rethrowing; the one
  report is `cli/run.ts`'s `logger.error('Failed during CLI execution', error)`. `tsflow-logger` (both twins)
  gained `messageOf()`, `describeThrowable()` and `formatThrowable()`: the error and its `cause` chain one per
  line, skipping a cause whose message the level above already embeds (this code base's wrappers do `Failed to
  X: ${error.message}` and keep the cause), the stack of each under `TSFLOW_VERBOSE`; continuation lines hang
  under the `└─` of the first. `cli/watch.ts` reports a failed run through the same formatter instead of the
  stack. Spec: `load-failure-test.feature` asserts the fixture path appears exactly once; the BeforeAll spec
  asserts the cause line.
- **AC.** The `undefined: undefined` report had two sources. (1) ts-node's `TSError` is built by make-error
  without calling `Error`, so Node's structured clone from the loader hooks thread turned it into an empty
  object with no prototype. `tsnode-loader.mjs` (the `ts-node-esm` transpiler) now rethrows any non-`Error`
  throwable from `resolve`/`load` as a plain `Error` carrying `TSError: ⨯ Unable to compile TypeScript:
  <file>(line,col): …`, the stack and `(while loading <url>)`. (2) The `node-esm` specs configure
  `ts-node-maintained/esm` **directly** as a `loader`, which tsflow cannot intercept; for that case
  `api/support.ts` wraps a non-`Error` import failure as `Failed to import support file "<path>": …`, so the file
  is named. `Cli.run()`'s wrappers use `messageOf()`. **The type-check asymmetry, decided: documented, not
  aligned.** It is not CJS versus ESM: every ts-node service tsflow configures (`ts-node`, `ts-vue`, `ts-node-esm`)
  is `transpileOnly: true`; a directly configured `ts-node-maintained/esm` loader (and `ts-vue-esm`, which
  delegates to it) is governed by the project's tsconfig and type-checks unless `ts-node.transpileOnly` or
  `TS_NODE_TRANSPILE_ONLY=true` says otherwise. That is why 12b's strict error surfaced only under `tsnodeesm`.
  Recorded in the CHANGELOG line; 12e should say it in the guide. Specs: `syntax-error-test.feature` (esbuild
  once-only; ts-node diagnostic names the file, on the `ts-node` and `ts-node-esm` transpilers) and
  `syntax-error-raw-loader-test.feature` (`Failed to import support file` names the file); unit test for a
  null-prototype throwable in both logger twins.
- **AD.** `PhaseRenderer.closingLine` / `end` and the spinner worker's `end` command carry `failed`;
  `StartupProgress.fail(summary = 'failed')` closes the open phase with `[ ✗ ]` in a muted red
  (`#D75F5F`, the spinner wheel's red stop, `failMark` on both themes) and is a no-op when no phase is open.
  `run-cucumber.ts` uses it for a load failure and for a throwing test-run hook. Plain-mode output is unchanged
  (` failed, <elapsed>`), which is what the specs read.
- **AE.** In serial mode the launch phase reads `assembling N test cases` and closes on the first
  `testRunHookStarted` (or `testCaseStarted`) envelope, so a hook's output starts on its own row. Parallel mode is
  unchanged: the phase spans the workers loading the support code and running their hooks, so output from a
  hook inside a worker (stdio is inherited) can still land on the open line; the theme `waiting` texts for the
  launch phase still speak of BeforeAll hooks, which is right for parallel and only shows after 30 s. Spec:
  `startup-phases-test.feature` on the new `basic` profile.
- **AF.** Both `unsupportedReason()` notices (watch fallback, selective load unavailable) name a built-in loader
  through `describeTranspiler` (`the es-node-esm loader …`) and fall back to the specifier
  (`the ts-node-maintained/esm loader …`). Unit tests cover both forms.
- **Real-console verification** (`verify-console-output`, preflight green: `isTTY=true`, glyphs single-cell,
  worker TTY stream ok) on the group 1 tree (`a29eb42`), the `node` workspace's `missing-import` and `basic` profiles in one child
  at 120 and 80 columns, pickle theme: every phase line closed on its own rows with no stale spinner frame;
  `[ ✗ ] Packing the jars — … failed, 289ms` (AD); `[ ✓ ] Cooling and chilling — assembling 3 test cases 8ms`, a
  blank row, then `beforeAll was called` at column 0 (AE); wrapped lines complete at 80 columns; cursor at column
  0 of the row after the last text. The harness redirects the child's stderr to its log, so the one report (AB)
  is verified as text once in the log, not as rendered rows; the `lotr` theme was not run (its `failMark` is the
  same function).

## What group 2 landed

- **A.** Four of the five `parallelLoad` declarations are gone: `ITsFlowRunOptionsRuntime` and
  `TsFlowRuntimeOptions` (`runtime/types.ts`), `IConfigurationExt` (`convert-configuration.ts`) and
  `ITsFlowLoadSupportOptions` (`load-support.ts`). The value never reached any of them: only the deprecation
  notice in `loadConfiguration` reads it. **Deviation from the triage, for the owner to confirm or reverse:** the
  hidden `--parallel-load [THREADS]` flag and the `ITsflowConfiguration.parallelLoad` declaration that carries it
  to the notice were kept. The flag shipped in 7.7.0 (it is in `master`'s `argv-parser.ts`), the package is at
  7.7.2, and the `Unreleased` CHANGELOG's own `Deprecated` entry promises the option stays accepted until the
  next major version; deleting it now would turn a 7.7.0 script's `--parallel-load` into commander's
  `error: unknown option`. The triage framed A as dead code, which the four declarations were and the flag is
  not. If the next release is a major, removing the flag is one commander option, one declaration, one unit
  test in `argv-parser.test.ts`, one `Deprecated` to `Removed` move in the CHANGELOG, and the CLI column of the
  `parallelLoad` row in both READMEs. **Confirmed by the owner the same day:** the branch ships as a minor
  release (7.8), and a minor must not remove or break anything a user could rely on; a major just to drop
  `parallelLoad` is not wanted. The flag stays, the deprecation notice (which already says the option does
  nothing, why, and that the transpile cache needs no configuration) is the message a user gets, and removal
  waits for the next major. A is closed as landed.
- **B.** `IMessageData.coordinates` is gone, and with it the `ChildProcessAdapter` constructor parameter and the
  `makeRuntime` option that existed only to carry it (upstream's `makeRuntime` and adapter never took one);
  `runCucumber` no longer passes `options.sources` to the runtime. `makeRuntime` is not exported from the
  package, so nothing outside changes. One clause added to the CHANGELOG's `resolvedSupportPaths` line.
- **C.** `TranspileCacheStats` is `{ hits, misses, writes }`; `isTranspileCacheEnabled()` already answered the
  first deleted field and nothing read the second. `isTimingEnabled()` left both timing twins; the two tests
  that called it now assert `startTimer() > 0` and a defined `getTimingSnapshot()`. `selectiveLoad` is
  deliberately **not** written back to the environment, and the call site in `load-configuration.ts` now says
  why: nothing reads `TSFLOW_SELECTIVE_LOAD` downstream, the value travels as `runtime.selectiveLoad`, and
  parallel children are sent the chosen subset by the coordinator. The existing unit test "without writing it
  back" pins the choice.
- **K/V.** `SupportLoadRecorder.endFile()` takes no arguments: both recorders close whatever the preceding
  `beginFile(path, kind)` opened and never read the two parameters the interface declared. `composeRecorders`
  and the two call sites in `getSupportCodeLibrary` follow; the `support.test.ts` recorders remember the open
  file themselves. `tsc -p test/tsconfig.json` is clean, so the tests no longer rely on calling a method with
  fewer arguments than its interface allowed.
- **L.** The phase id is `'parse'`: `StartupPhaseId`, both theme tables, the `runCucumber` call, two unit-test
  lines, Architecture.md (whose phase list now also reads in run order, resolve, parse, load, launch, and no
  longer says the formatters have a phase) and `.claude/skills/verify-console-output/scripts/child-template.js`,
  which drives the phases by id. The `TSFLOW_TIMING` phase named `gherkin` is unchanged.

## What group 3 landed

- **E.** `src/utils/paths.ts` is the one place a file path is normalized. `canonicalPath`, `canonicalFromUrl` and
  `canonicalFromFrameFile` moved there from `module-graph.ts` unchanged (module-graph keeps the graph, the
  versioning and `withoutQuery`, and imports the canonical family; `selective-load.ts`, `support-reloader.ts` and
  `cli/watch.ts` import it from the new home). Two helpers join them: `toPosixPath()` replaces the three ad-hoc
  `replace(/\\/g, '/')` calls (`register-loaders.ts` and `startup-progress.ts` match a specifier against a
  pattern, `loader-utils.mjs` builds a relative import specifier; the loader reaches it through the same
  `createRequire` it already uses for `module-graph.js`), and `relativeToCwd()` replaces both the timing report's
  `displayPath` and `Callsite`'s cwd-prefix strip. `tsflow-timing.ts`'s `normalizeFile`, which duplicated
  `canonicalPath` byte for byte, is now `canonicalFromUrl(file) ?? file` for a URL and `canonicalPath(file)`
  otherwise. **One deliberate difference:** `Callsite.filename` used a case-sensitive prefix comparison against
  `process.cwd() + sep` computed at module load; `relativeToCwd` uses `path.relative`, so on Windows a mapped
  filename whose drive letter case or separators differ from the working directory's is now made relative where
  it was left absolute before, and a filename that is already relative is returned untouched (the old code would
  never have matched it either). The working directory is read per call. The Windows matrix passed; CI's Linux
  jobs see the change when the group is pushed. Tests: the three moved describe blocks plus `toPosixPath` and
  `relativeToCwd` (a file beneath the cwd, a relative input, the cwd itself, a sibling and a parent, and on
  Windows the drive-letter and separator spellings) in `test/utils/paths.test.ts`.
- **F.** `src/utils/file-stamp.ts` holds `FileStamp { mtimeMs, size }`, `stampOf(file)` (undefined for anything
  but a regular file that can be stat'd) and `sameStamp(a, b)`. `selective-load.ts` stores that shape in its
  index (so `INDEX_FORMAT` is 2: an index written by the tuple format is ignored and rebuilt once, which costs a
  full load on the next run of any suite that had one; the feature is unreleased, so no user has such an index)
  and keeps `MISSING_STAMP = { -1, -1 }` for a dependency it cannot stat, as before; `isStale` is one `sameStamp`
  per dependency. The transpile-cache prune scan's entries are `{ file, stamp }`, its `isFile()` check and its
  stat `try/catch` both now being `stampOf`. Tests: `test/utils/file-stamp.test.ts` (a real file's stamp equals
  its `stat`, undefined for a missing file and a directory, `sameStamp` on each field); the existing
  `selective-load.test.ts` and `transpile-cache.test.ts` prune cases cover the two consumers.

## What group 4 landed

- **H.** The look first: neither `supports()` was called anywhere (source, tests, spec workspaces), and the ESM
  one's rejection of `.ts` dates from `e24f4ff` (2025-08), when the esbuild loaders still routed TypeScript
  through ts-node and `supports()` said which files were esbuild's; Phase 5 removed that routing and left the
  function behind. Both are deleted. They were reachable only through the `./lib/*` wildcard export, which
  this branch has already treated as internal (Phase 8 deleted whole modules under it, group 2 deleted
  `isTimingEnabled()` and two fields under it), so this is not a removal of published surface. The two
  `transpileCode()` are aligned by sharing one implementation: `transpilers/esbuild.ts` exports
  `transformOptionsFor()` (the fixed options, the decorator mode in `tsconfigRaw`, the caller's overrides,
  the loader by extension, and the output format), `esbuildCacheKey()` and `runEsbuild()`; `esm/esbuild.mjs`
  loads them through `createRequire`, as it already loaded the transpile cache, and keeps only what an ES
  module needs (`format: 'esm'` with `platform: 'node'`, `rewritePathMappings` before the transform, the
  mappings in its key). Both use the cache kind `esbuild`; the format is in the key, so entries stay distinct
  (`cache-keys.test.ts` pins it). The ESM module's own loaders table and `defaultOptions` are gone. Test:
  `test/transpilers/esbuild.test.ts`.
- **I.** `loadVue` in `esm/loader-utils.mjs` caches the compiled component together with its
  `transformImports` pass in one entry, kind `vue-sfc-esm`, keyed on `vueSfcCacheKey(options)` plus the
  tsconfig `absoluteBaseUrl` and `paths` the transform rewrites bare specifiers through (the rewritten paths
  are relative to the component's directory, which the file name in the key covers). A warm load reads one
  entry and runs nothing; before, the regex pass ran over the cached output on every load.
  `vue-sfc-compiler.ts` exports `resolveVueSFCOptions()`, `vueSfcCacheKey()` and `compileVueSFCUncached()`
  for it; `compileVueSFC()` (the CJS Vue transpilers, kind `vue-sfc`) behaves as before. The format-`'esm'`
  wrapper `esm/vue-sfc-compiler.mjs`, which only `loadVue` used, is deleted. Test: `loadVue` in
  `loader-utils.test.ts` (one compile, then one cache read with the same output). Architecture.md's
  transpile-cache paragraph follows.
- **J.** `utils/decorator-mode.ts`: `setExperimentalDecorators(enabled)` records the mode once (the global for
  the decorators' hot path, `CUCUMBER_EXPERIMENTAL_DECORATORS` for the transpilers, because only the
  environment reaches the loader hooks thread and the forked children), and `experimentalDecorators()` reads
  it. `loadConfiguration` and the parallel worker (which receives the mode over `EXPERIMENTAL_DECORATORS`
  from the adapter, unchanged) call the setter; `esbuild.ts`, `esm/esbuild.mjs` and `vue-sfc-compiler.ts`
  call the getter on every transpile instead of reading the global or the environment when their module
  loads, and `esm/tsnode-loader.mjs` calls it when it creates its ts-node service. The Vue cache key is now
  built from the same value the ESM transpiler uses, which closes the stale-cache ordering the finding
  described. The decorators in `bindings/` still read the global; J's remit was the transpilers. Tests:
  `test/utils/decorator-mode.test.ts`; the three decorator-mode cases in `cache-keys.test.ts` toggle the mode
  through the setter and no longer re-import the transpiler modules. Architecture.md's configuration bullet
  follows.

## What the Z fix landed (source-map relay for `module.register()`)

Written by the session that made `fec46e9`. Under `TSFLOW_ESM_HOOKS=async` (and on Node versions without
`module.registerHooks`) the esbuild ESM loaders run on Node's loader hooks thread, whose globals the main thread
never sees, so the maps `loadTypeScript()` records on `__CUCUMBER_TSFLOW_SOURCE_MAPS` were never found by
`Callsite.resolve()`; it fell back to `source-map-support`, which has no map for in-memory transpiled code, and
reported the `file:` URL with the transpiled line (the BeforeAll spec's `before-all-throws.ts:9` became
`file:///...before-all-throws.ts:50` in the async CI job, and every step definition's `uri` in that mode was
raw; the Phase 6 item 28 limitation). `registerLoader()` (`api/register-loaders.ts`) now hands tsflow's two
esbuild loaders a `MessagePort` in the `module.register()` data, merged with the timing port options via a small
`mergeRegisterOptions()`; the new `transpilers/esm/source-map-relay.mjs` supplies the loaders' `initialize` hook
and wraps `load` so each module's recorded map is posted before its source is returned (a pass-through without a
port, which is the in-thread `registerHooks` case); the new `utils/loader-source-maps.ts` keeps the receiving
ports and drains them synchronously with `receiveMessageOnPort` on the first lookup miss, into the same global
the in-thread path uses, and `utils/our-callsite.ts` reads through it. `esnode-loader.mjs` and `esvue-loader.mjs`
wrap their loader and export the new `initialize`; ts-node and third-party loaders receive only the timing port.
Ordering is safe because a loader posts before returning the module's source and callsites are resolved after
the support code has loaded. Verified: strict null-check type-check clean on the touched files; six new unit
tests in `test/utils/loader-source-maps.test.ts` and `test/transpilers/esm/source-map-relay.test.ts`; node-esm,
vue-esm, node-exp-esm and vue-exp-esm esbuild variants and node-esm ts-node green under `TSFLOW_ESM_HOOKS=async`;
node-esm esbuild unchanged under default hooks; the `before-all-throws` profile names `before-all-throws.ts:9` in
serial and `--parallel 1` under both hook modes.

## What group 5 landed

- **D / U.** One implementation of "make these modules evaluate again", in the place that loads.
  `getSupportCodeLibrary()` (`api/support.ts`) starts every load from nothing (`resetStepPatternRegistrations()`,
  `BindingRegistry.instance.clear()`, the builder reset) and, on every load after the first in a process (a
  module-level counter, which is also the ESM version it hands out), calls `evictRequiredModules()`,
  `bumpModuleVersions()` and `notifyReload()` for the set its new `reevaluate` parameter names, by default every
  support file being loaded. `SupportReloader.prepare()` no longer evicts, versions, clears or notifies: it
  computes the set as before and returns it in its summary as `files`, which `runCucumber` passes on.
  `loadSupport()` and `reloadSupport()` share one body: the set is the entry files plus, when `changedPaths` is
  non-empty, the changed modules and `dependentProjectModules(changed)`; `evictChangedAndDependents` and
  `evictAllSupportModules` are deleted with their duplicate closure. Both now call `setExperimentalDecorators()`
  when `options.experimentalDecorators` is given, an option the interface declared and nothing read (the spec's
  driver process needs it, and so does any API consumer that never calls `loadConfiguration`). The parallel
  child (`runtime/parallel/worker.ts`) loads through `getSupportCodeLibrary` with the coordinator's
  `supportCodeIds` (a new optional parameter, passed to `finalize()`) instead of through a copy of the loop, and
  `logger` became optional for it; a child now names a support file that fails to import the way the
  coordinator does. Four defects of `reloadSupport` fall out, recorded in one `Fixed` entry: an unchanged support
  file stayed cached and was missing from the reloaded library (only the changed file and its support-file
  dependents were evicted); a changed helper's intermediate dependents were not evicted, so a re-evaluated file
  could keep the old helper; ES modules were never reloaded; and the registry kept the previous evaluation's
  bindings, so the old class shadowed the new one under the same pattern (`registerStepBinding` deduplicates on
  the raw callsite position, and the step wrappers look bindings up in the registry at execution time).
- **The reload-support spec left the process.** With the registry cleared per load, calling `loadSupport` from
  inside a running scenario wipes the suite's own bindings; verified before the rewrite: `Unable to find
  StepBinding!` on the step after the call. `reload-support-test.feature` keeps four scenarios, reworded, whose
  steps drive `src/fixtures/reload-driver.ts` in a child process started as `node -r
  @lynxwall/cucumber-tsflow/esnode` (the package's `./esnode` export, resolved from the workspace), one command
  per stdin line and one JSON reply per stdout line, the way a persistent worker uses the API. The driver loads
  two fixtures (`reload-fixture.ts` and the new `reload-fixture-two.ts`), takes the decorator mode from the
  `CUCUMBER_EXPERIMENTAL_DECORATORS` the spec run's environment carries and passes it as `experimentalDecorators`,
  and reports the sorted step patterns, the hook count, and whether the first fixture's `require.cache` entry is
  a new object since the previous command. The fourth scenario is new in substance: a reload with the first
  fixture as the changed path must keep the second file's step, which the old code failed. The `@reload` tag and
  the ESM workspaces' `not @reload` exclusion are unchanged. Files in both `node` and `node-exp`.
- **N.** `watch: true` on the `node` workspace's `watch` profile and on the `node-esm` workspace's `watch` and
  `watch-tsnode` profiles; `WatchSession.start(profile, args)` passes only the arguments a scenario names. The
  in-process watch scenarios therefore exercise a profile turning watch mode on, and the `watch-tsnode` fallback
  exercises the child's `--no-watch` overriding it (CucumberJS merges with `lodash.mergewith`, which keeps a
  profile's `true` when the argv value is undefined and lets an explicit `false` win; both ends now run in the
  matrix). The failure spec's `missing-import` profile is also run once, without watch, by the load-failure spec,
  so it cannot set `watch`; a new step, `a watch session on the {string} profile with {string} has completed its
  first run`, keeps the flag there. Extended beyond the triage's "`node` workspace" to `node-esm` because the two
  workspaces share the step text, and one rule for both reads better than a launcher that guesses.
- Tests: `support.test.ts` records the new contract (a later load evaluates every file again and the class the
  second evaluation defined is the one bound; `reevaluate` honored, with the kept file registering nothing;
  versions and reload listeners on every load after the first; the old "leaves eviction to the caller" case is
  gone with the contract). `support-reloader.test.ts` loads through the real `getSupportCodeLibrary` with the
  reloader as recorder and `summary.files` as `reevaluate`; its temp fixtures report their evaluation through a
  global (`__tsflowReloaderTest`), which also stands in for their decorators, and the assertions are on which
  modules evaluated rather than on `require.cache` state. `yarn test:unit` is at **261 tests**.

## What group 6 measured

UIS Tools VueApp, `es-vue-esm`, experimental decorators, serial, `TSFLOW_TIMING=true`, `TSFLOW_THEME=off`, one
build (`972d5b9`), one machine, one session (2026-09-24, 07:50 to 09:50), against the Phase 10 clean reference in
[phase-10-hand-off.md](phase-10-hand-off.md#measured-effect-on-the-large-suite) and the Phase 8 warm rows in
[phase-08-hand-off.md](phase-08-hand-off.md). Finding P rode along as the A/B: **on** rows are the shipped bin
(`module.enableCompileCache()`), **off** rows set `NODE_DISABLE_COMPILE_CACHE=1`; the transpile cache was warm for
every row not marked cold. Wall clock is the timing report's "ms since process start". Twenty runs were taken and
eight are clean; the rest are shown and marked, not hidden, by the criterion of the earlier phases (a `bootstrap`
over a second, a startup row more than double its neighbors, or a runtime more than 1.5 times the clean band). No
stray filesystem scanner was found before the series (the Phase 11 check), but the owner was working on the
machine throughout with agent sessions in three other repositories, and the UIS working tree itself moved at 08:51
(a pull; the suite grew from 1583 to 1616 scenarios and 36 support files changed), so the runs after that point
are on a slightly different suite. The notes say what the disturbed runs have in common.

`dim` (334 to 335 scenarios, 200 files through the hooks), fresh process:

| Run | Compile cache | `bootstrap` | `gherkin` | `esm:resolve` (2823 to 2827 calls) | `esm:load` (912 to 913) | `transpile-cache:hit` (200) | `support:import` | `runtime:run` | Wall clock | Note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | on | 6182 ms | 40 ms | 3475 ms | 21964 ms | 200 misses, 3045 ms | 67.1 s | 40.4 s | 134 s | cold: first run after the build, under group 4's new cache keys; discarded |
| 1 | on | 34203 ms | 613 ms | 824 ms | 502 ms | 48 ms | 37.7 s | 39.6 s | 160 s | startup disturbed (the two files that load jsdom and the library's setup took 41 s and 36 s); discarded |
| 2 | on | 502 ms | 46 ms | 800 ms | 302 ms | 71 ms | **2547 ms** | 44.4 s | 48.2 s | clean |
| 3 | off | 458 ms | 65 ms | 805 ms | 285 ms | 57 ms | **2386 ms** | 45.3 s | 49.0 s | clean |
| 4 | on | 429 ms | 38 ms | 681 ms | 248 ms | 47 ms | **2245 ms** | 48.5 s | 51.8 s | clean |
| 5 | off | 386 ms | 42 ms | 667 ms | 244 ms | 43 ms | **2059 ms** | 42.6 s | 45.7 s | clean |
| 6 | off | 23763 ms | 610 ms | 6125 ms | 39392 ms | 6765 ms | 88.1 s | 95.3 s | 235 s | disturbed throughout; discarded |
| 7 | on | 8658 ms | 70 ms | 3309 ms | 1391 ms | 204 ms | 48.4 s | 107.1 s | 180 s | disturbed throughout; discarded |
| 8 | off | 850 ms | 70 ms | 1836 ms | 688 ms | 150 ms | 5055 ms | 117.2 s | 127 s | disturbed (runtime 2.5 times the band); discarded |
| 9 | on | 922 ms | 63 ms | 2711 ms | 957 ms | 184 ms | 8268 ms | 117.7 s | 130 s | disturbed; discarded |

Reference: Phase 8's warm `dim` rows had `bootstrap` 422 to 527 ms, `esm:resolve` 621 to 657 ms, `esm:load` 259
to 280 ms, hits 42 to 49 ms, `support:import` 2175 to 2497 ms and `runtime:run` 37.9 to 40 s; Phase 10's `dim`
first run had `gherkin` 44 ms, `esm:resolve` 895 ms, `esm:load` 338 ms, `support:import` 2844 ms and `runtime:run`
48.4 s. **Runs 2 to 5 sit inside those bands on every row.** The runtime's own spread (42.6 to 48.5 s over four
clean runs of one build) is the one the Phase 8 series saw.

Full suite (`-p default`; 1583 scenarios for runs 0 to 4, 1616 for runs 5 and 6), fresh process:

| Run | Compile cache | `bootstrap` | `gherkin` | `esm:resolve` (9631 / 9681 calls) | `esm:load` (2570 / 2573) | `transpile-cache:hit` (974 / 977) | `support:import` | `runtime:run` | Wall clock | Note |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | on | 655 ms | 1895 ms | 3834 ms | 31790 ms | 774 misses 6065 ms, 200 hits 65 ms | 39.1 s | 234.7 s | 277 s | cold for the 774 files `dim` does not load; discarded |
| 1 | on | 16315 ms | 489 ms | 1960 ms | 1354 ms | 425 ms | 8086 ms | 216.5 s | 251 s | startup disturbed, runtime clean; startup discarded |
| 2 | on | 448 ms | 175 ms | 3109 ms | 1189 ms | 384 ms | **7048 ms** | 214.1 s | 222.5 s | clean (see the note on its `esm:resolve`) |
| 3 | off | 382 ms | 155 ms | 1721 ms | 831 ms | 271 ms | **4124 ms** | 233.9 s | 239.3 s | clean; the fastest startup recorded on this suite |
| 4 | on | 32516 ms | 233 ms | 9272 ms | 113578 ms | 29098 ms | 241.8 s | 444.5 s | 764 s | disturbed throughout; discarded |
| 5 | on | 19260 ms | 3308 ms | 5667 ms | 77635 ms | 941 hits 19635 ms, 36 misses | 125.2 s | 254.6 s | 430 s | disturbed throughout, and the first run on the moved tree; discarded |
| 6 | on | 5324 ms | 2003 ms | 2957 ms | 34533 ms | 11658 ms | 61.7 s | 252.0 s | 324 s | disturbed throughout; discarded |

Reference: Phase 10's clean full run had `gherkin` 165 ms, `esm:resolve` 1865 ms, `esm:load` 1411 ms, hits
478 ms, `support:import` 5125 ms, `runtime:run` 234.5 s and 4 m 1 s wall clock; Phase 8's warm rows had
`esm:resolve` 1748 to 2084 ms, `esm:load` 927 to 1106 ms, hits 254 to 311 ms, `support:import` 5116 to 5519 ms and
`runtime:run` 196 to 214 s. **Runs 2 and 3 are within those bands**, with one row to name: run 2's `esm:resolve`,
3.1 s over the same 9631 calls, is 1 s above the top of the band while its `esm:load` and hits sit at the bottom of
theirs, and run 3, six minutes later, has the row at 1.7 s. Nothing in the resolve hook changed in 12c apart from
group 3's `canonicalPath` consolidation, which `dim` does not show either (four clean runs at 0.24 to 0.29 ms per
call against Phase 8's 0.22 to 0.23); the row is read as the run-to-run variance Phase 8 recorded on it (1586 to
2084 ms across four clean runs). `runtime:run` over the four fresh runs with a clean runtime (0 to 3) is 214 to
235 s against Phase 10's 234 s and Phase 8's 188 to 218 s.

`--watch`, one rerun, driven through a piped stdin by `research/scripts/watch-driver.js`:

| Profile | Run | `gherkin` | `esm:resolve` (calls) | `esm:load` (files) | `transpile-cache:hit` | `support:import` | `formatters:init` | `runtime:run` | Wall clock of the run | Heap after |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `dim` | first (fresh) | 284 ms | 3111 ms (2827) | 24100 ms (913) | 2359 ms (201) | 74.5 s | 129 ms | 38.1 s | 2 m 24 s | 1.4 GB |
| `dim` | rerun (`33 evaluated again`) | 29 ms | 48 ms (311) | 21 ms (33) | 11 ms (33) | **405 ms** | 5.5 ms | 40.1 s | **40.6 s** | 2.4 GB |
| full, `--max-old-space-size=8192` | first (fresh) | 1754 ms | 3176 ms (9681) | 47920 ms (2573) | 10113 ms (977) | 73.1 s | 20 ms | 484.7 s | 9 m 20 s | 4.0 GB |
| full | rerun (`213 evaluated again`) | 550 ms | 1059 ms (1831) | 792 ms (213) | 433 ms (213) | 5428 ms | 48 ms | 915.1 s | 15 m 22 s | 7.6 GB |

Both first runs had disturbed startups (the `dim` one at 26 ms per `esm:load`, the full one at 19 ms) and the full
one a doubled runtime; the fresh-process rows above measure them properly and they are not re-read here. **The
`dim` rerun is Phase 10's rerun row for row**: Phase 10 had `gherkin` 25 and 20 ms, `esm:resolve` 51 and 47 ms over
311 calls, `esm:load` 20 and 21 ms over 33 files, `support:import` 133 and 421 ms, `runtime:run` 41.0 and 56.4 s,
heap 2.5 and 3.5 GB after its second and third runs. The full-suite rerun, which Phase 10 could not complete (it
died at the 4 GB default heap about 80 scenarios in), completes with the heap raised: its startup is sound (213
files evaluated again in 5.4 s against Phase 10's 10.0 s for 211, and the features parsed in 0.55 s against 2.5 s),
and then the run itself takes 15 minutes at a 7.6 GB heap and fails 17 scenarios. Those failures are the suite's
retained state, which the Phase 10 hand-off and the README already describe: two assert that a `jest.fn()` was not
called and it carries its call count from the first run, three time out at 5 s under a heap V8 spends its time
compacting, and the rest are elements or matches not found in a document the first run left behind. None of them
is tsflow's, and the fresh full run of the same tree passes all 1616. The conclusion stands as Phase 10 wrote it:
watch mode is for the filtered inner loop, and the heap line after each run is the signal to read.

**Finding P, the compile cache.** Three clean pairs, interleaved on and off, same build: `dim` `bootstrap` 502
against 458 ms and 429 against 386 ms, `support:import` 2547 against 2386 ms and 2245 against 2059 ms; the full
suite `bootstrap` 448 against 382 ms and `support:import` 7048 against 4124 ms (the pair that includes run 2's high
resolve row). Off is 40 to 70 ms quicker to bootstrap in all three and never slower on any row. That is the Phase 4
result again ("indistinguishable with and without"), with the sign now consistently, if slightly, against the
cache, and there is a plain reason for it: the library, jsdom and Vue arrive through Node's CommonJS loader already
warm in the OS file cache, so the bytecode the cache saves recompiling is cheap, while every module costs one more
file open to look its entry up (the cache directory holds 18719 entries, 100 MB, for this machine's Node). The
cache is kept as shipped: it is what Phase 4 decided and what the README and CHANGELOG document, turning it off
would be a published-behavior change for a gain inside the noise, and Node's own switches
(`NODE_DISABLE_COMPILE_CACHE=1`, `NODE_COMPILE_CACHE=<dir>`) already let a consumer choose. The owner can reverse
this in 12d with the README "Compile cache" section, the CHANGELOG entry and the bin file as the three places to
touch; the numbers here are the measurement the triage asked for.

**Result: the UIS numbers are within noise of the Phase 10 reference on every row the plan named, and the
stage's gate is met.** Nothing moved, so nothing was bisected; group 5's two working commits remain recoverable
from the squashed diff by file should a later measurement disagree.

## Notes specific to the stage close and 12d

- **Stage 12c is closed (2026-09-24): every triaged finding landed, moved or closed, the boundary matrix was green
  after each of groups 1 to 5, and the closing measurement is within noise of Phase 10** (the section above). 12d,
  the housekeeping sweeps, is next; its definition and gate are in
  [phase-12-plan.md](../plan/phase-12-plan.md#12d-housekeeping-sweeps) and the items the earlier groups left for it are in
  the leftover bullets below. The plan allows the stage to be squashed further now that the measurement is done;
  that is the owner's call and was not done here.
- **Finding P is closed by measurement**, the compile cache kept as shipped; the numbers, the reasoning and the
  three places to touch if the owner prefers to drop it are under "Finding P" above.
- **The discard rule needs a second clause.** `local-consumer-testing.md` said to discard the first run after any
  install or build. This session's first `dim` run after the build was cold as expected, and then the *next* run was
  disturbed at startup while everything the hooks did was fast; the full suite repeated the pattern (run 0 cold,
  run 1 disturbed at startup). The run that follows a run that wrote hundreds of new cache entries (200 and 774
  transpile-cache entries here, under group 4's new keys) also pays, presumably for background scanning of what
  was just written. The rule in that document now reads: discard the first run after a build or install *and* the
  first run after any run that reported many transpile-cache misses.
- **Disturbed runs share one signature and it is not tsflow's.** In all twelve, every file read is slow at once:
  `gherkin` (212 feature files nothing has written) at 3 to 20 times its 165 ms, transpile-cache hits at 12 to
  30 ms each against 0.3 ms, `esm:load` at 19 to 44 ms per file against 1 ms, `bootstrap` at 5 to 34 s; when the
  runtime is affected too it is exactly doubled. Per-process CPU sampling during a disturbed run never showed a
  competing process (the cost lands inside the measured process, as filter-driver or on-access-scan latency does)
  and the disk-time counter read under 8 % between runs. One cause was self-inflicted: a Git Bash `find` with a
  `-mmin` test over the 18719 compile-cache files took minutes (its per-file `stat` emulation is slow; Node stats
  the same files in 2.5 s) and overlapped full run 5. The rest coincide with the owner working on the machine with
  agent sessions in three other repositories, one of which pulled the UIS tree mid-series, and with a peer
  session's two `yarn build` runs in this tree near the end; the eleven-run stretch from full run 4 onward has one
  clean run in it. For the next measurement session: check for stray scanners *and* for peer agent sessions
  (`ListAgents`) before starting, and if anything else is active on the machine, take the fresh-process rows in
  one uninterrupted block early or leave them for a night run. A mid-session hypothesis that the disturbances
  followed the compile cache (the first six were all cache-on runs) was falsified by `dim` runs 6 and 8, cache off
  and disturbed.
- **The full-suite rerun under `--watch` completes with an 8 GB heap** and shows the suite's retained state as
  failures rather than as an out-of-memory crash (17 of 1616, itemized above). The README's guidance from Phase 10
  covers it; nothing to change. The heap line printed after each run (4.0 GB, then 7.6 GB) is doing its job.
- **Two sessions worked in this tree at once again** (this one on group 6, a peer on the 12e agent skill), and the
  working agreement below held. Two refinements from this time: the peer announced its commit by message before
  making it and again when it had landed, so the documentation commits went in one after the other with no
  overlap; and a build by either session is a measurement disturbance for the other, so during a measurement
  series the peer asks before building.
- `research/scripts/watch-driver.js` is the piped-stdin driver used for the watch rows (spawn the CLI with
  `--watch`, wait for each `Run took` line, write a newline for a rerun and `q` to quit, log everything); usage is
  in `local-consumer-testing.md` under "Watch mode on this suite". A `find` over a large directory from the
  assistant's Git Bash is a stray scanner in the Phase 11 sense: prefer a Node one-liner for anything that stats
  thousands of files.
- Nothing is open from group 5: all three findings landed as triaged, with two decisions the owner may want to
  read: the reload spec moved out of process (the triage's own decision, a load clearing the registry, made the
  in-process spec impossible), and N covers `node-esm` as well as `node`.
- Leftovers noticed in group 5, none in the triage, for the owner: `BindingRegistry.removeBindingsForFile()` and
  `hasBindingForKey()` (`bindings/binding-registry.ts`) are called nowhere; they were written for the old
  delta-aware reload that D replaced and are reachable only through the `./lib/*` wildcard export, which this
  branch treats as internal; the owner has put them on 12d's dead-code list. `tsc --noEmit -p test/tsconfig.json`,
  part of the cadence since group 2, reported four `TS7017` errors (`globalThis` indexed without a signature) in
  `test/transpilers/esm/source-map-relay.test.ts` and `test/utils/loader-source-maps.test.ts`, both from the Z
  fix `fec46e9` (`node --test` strips types without checking, so the tests ran green). Fixed at the owner's
  request after the group 5 hand-off, in the commit following it: `test/globals.d.ts` declares
  `__CUCUMBER_TSFLOW_SOURCE_MAPS` for the test program, because the library's own `src/types/global.d.ts`
  imports a runtime module and including it would pull the 21 known strict errors into the strict test build.
  The declaration is a copy and must follow the library's if the shape changes.
- Nothing is open from group 4: all three findings landed as triaged. H's look answered its question (the
  `.ts` rejection was a leftover of the pre-Phase-5 ts-node routing, and nothing called either `supports()`).
- **Two sessions worked in this tree at once during the group 4 session**, this one on group 4 and a second on
  the Z fix above, and the working agreement that emerged is worth keeping whenever that happens again: each
  session names the files it will touch before editing and keeps to them; each stages with explicit paths and
  never `git add -A`; `yarn build` and spec runs against `lib/` are handed over by message, one session at a
  time, since both build into the same `lib/`; nothing below HEAD is rebased, reset or squashed while the other
  is working; and a group's squash happens before the other session's commit lands on top of it, so the soft
  reset still has a contiguous run of working commits. The peer session is listed by `ListAgents` and reached
  with `SendMessage`.
- **A unit-test flake, seen twice, not reproduced since.** In one `yarn test:unit` run right after a build,
  `SelectiveLoadSession` › "compiles patterns with the parameter types the index recorded" failed; in a
  standalone run of the same file a minute later, "loads a file whose import graph changed since it was indexed,
  then trusts the rewritten record" failed instead; twelve further runs (eight plain, two after a fresh build,
  the rest standalone) were green. Both tests assert on an index the previous `run()` wrote, and
  `SelectiveLoadSession.writeIndex()` is best-effort: a failed `renameSync` of the temp file over the index is
  swallowed into a verbose checkpoint, so a transient Windows `EPERM`/`EBUSY` on the rename (an antivirus or
  indexer holding the file briefly, a well-known Windows failure mode) would leave the old index in place and
  fail the *next* assertion, which fits both symptoms. `transpile-cache.ts`'s `writeEntry` has the same shape.
  Not in the triage; a short retry on those two codes in both writers is a candidate for the owner to accept or
  decline (12d, or group 5 if it recurs), not something to add unasked.
- Leftovers noticed in group 4, none in the triage, for the owner: `esm/esbuild.mjs` (`loadTsConfigPaths`) and
  `esm/loader-utils.mjs` (`initializeTsconfigPaths`) each call `tsconfig-paths`' `loadConfig()` once per thread
  and keep their own copy of `absoluteBaseUrl`/`paths`; one loader could hand the other its result.
  `TranspileOptions.debug` is declared and defaulted but read nowhere. The parallel adapter carries the decorator
  mode to its children as a second environment variable, `EXPERIMENTAL_DECORATORS`, which `run-worker.ts` turns
  back into a boolean for the worker's `setExperimentalDecorators()`; the children also inherit
  `CUCUMBER_EXPERIMENTAL_DECORATORS`, so one variable would do.
- The editor's diagnostics are delivered to the assistant after every edit (a PostToolUse hook prints the
  Problems-panel entries for the edited file), so the strict type-check at the end of a change confirms rather
  than discovers; the check still runs, because the hook reports only the file just edited, not its importers.
- Leftovers noticed in groups 1 to 3, none in the triage, all for 12d or 12e rather than group 5:
  `api/load-configuration.ts` (ten sites) and `api/convert-configuration.ts` (two) still log with `logger.error`
  before rethrowing, so a configuration error prints `[tsflow:config]:ERROR …` and then the `[tsflow:run]`
  report, two copies (same mechanical change as the loaders in AB; 12d). Both READMEs still list **Parallel
  preload** as a feature at line 29 and the root README's transpile-cache paragraph still mentions "`parallelLoad`
  preload threads" (12e). `transpile-cache.ts` has two British spellings of "serialize" (12d's spelling sweep). In a
  parallel run where no test case ever starts (the BeforeAll spec's second scenario), the formatter's summary
  prints before the launch phase line closes, because the phase closes after `runtime.run()` resolves and the
  formatter's `testRunFinished` listener was registered first; cosmetic, pre-existing. Three links in
  `ratings.md` point at the `parallelLoad` source files Phase 8 deleted; they were broken before the document
  split and are history.
- Working notes for the next session: the assistant's Bash tool halves doubled backslashes on the way to the
  shell, so a heredoc that must contain a two-character escape such as backslash-r needs each backslash
  doubled twice; and two parallel tool calls share the shell's working directory, so workspace-bound commands
  (`cd cucumber-tsflow-specs/node && node …`) must run one at a time or chained in one command, or the second
  runs in the first one's directory.
- **Commit workflow, decided by the owner at the end of the group 1 session (2026-09-23).** The branch must not
  accumulate a commit per finding for the rest of Phase 12 (seven per group would put the review cycle at fifty).
  Small commits stay the way of working *inside* a group: they carry the per-commit cadence and let the group 6
  measurement bisect a regression to one finding. Before a group's hand-off is written, and before anything is
  pushed, the group is squashed to **one commit** (soft reset to the previous boundary, one commit whose message
  lists the findings), and the hand-off names that hash rather than the working hashes. The stage may be squashed
  further once the measurement is done. Lonnie, the original author, will review the pull request to `master`
  (most likely with an agent) from the aggregate diff, the CHANGELOG, Architecture.md and the execution strategy documents, so the
  commit list is a matter of history hygiene, not of what the reviewer reads; the final merge can also be a
  squash-merge. **Done at the start of the group 2 session (2026-09-23):** the seven group 1 fixes and the two
  hand-off commits were squashed into `a29eb42` on top of `1c842e6` (soft reset, one commit; the tree is
  byte-identical to the last working commit), the hashes above were replaced, and the branch was pushed so the
  draft pull request's CI matrix (Ubuntu and Windows, Node 22 and 24, one job with `TSFLOW_ESM_HOOKS=async`) sees
  group 1: the new specs spawn child processes and write a fixture under `src/fixtures/failing/generated`, both
  first exercised on Linux there. Nothing had been pushed since `24cefb7`, so no force-push was needed. The split
  of the execution strategy into `research/execution-strategy/` (one document per phase or stage, the strategy
  file reduced to a map), done at the end of the group 1 session but left uncommitted, went in as the next commit.
