# Stage 12c hand-off

Part of the [Performance Enhancement Execution Strategy](../performance-enhancement-execution-strategy.md).

Written as the groups land (started 2026-09-23), so that a pause after any group can resume cold. Stage 12c is
[Review refactors](phase-12-plan.md#12c-review-refactors): the triaged findings in six groups, one concern per commit. **Groups 1
to 4 are complete; groups 5 and 6 have not started.**

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

## Notes specific to the pause and group 5

- **Group 4 boundary: `yarn test:all` green on all sixteen variants (counts above).** Groups 5 and 6 remain.
  Group 5 is loading and eviction, D/U and N, the largest behavior change of the stage, placed last so that if
  the closing measurement moves the culprit is fresh. D/U: one eviction and dependent-closure implementation,
  with `getSupportCodeLibrary()` owning eviction so its callers stop doing it three ways, and `reloadSupport()`
  clearing the registry and notifying listeners like `SupportReloader.prepare()`; verified by `support.test.ts`,
  `support-reloader.test.ts`, `reload-support-test.feature` and both watch specs. N: the `node` workspace's
  `watch` profile sets `watch: true` and the spec stops passing `--watch`; verified by `watch-mode-test.feature`.
  Group 6 is the closing measurement on the UIS suite against the Phase 10 reference, with P's compile-cache A/B.
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
  preload threads" (12e). `transpile-cache.ts` has "serialised" / "serialise" (12d's spelling sweep). In a
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
