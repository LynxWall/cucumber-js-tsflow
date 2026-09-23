# Stage 12c hand-off

Part of the [Performance Enhancement Execution Strategy](../performance-enhancement-execution-strategy.md).

Written as the groups land (started 2026-09-23), so that a pause after any group can resume cold. Stage 12c is
[Review refactors](phase-12-plan.md#12c-review-refactors): the triaged findings in six groups, one concern per commit. **Groups 1
and 2 are complete; groups 3–6 have not started.**

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
  `parallelLoad` row in both READMEs.
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

## Notes specific to the pause and group 3

- **Group 2 boundary: `yarn test:all` green on all sixteen variants (counts above).** Groups 3–6 remain, in the
  order the plan gives; group 3 (E, F: one path-normalization helper, one stamp shape) is next and needs no spec
  changes. Its verification is `module-graph.test.ts`, `tsflow-timing.test.ts`, `selective-load.test.ts`,
  `transpile-cache.test.ts` and, for E, the full matrix, because `loader-utils.mjs` is one of the six call sites.
- The one open question from group 2 is A's kept flag, above. Everything else in group 2 matched the triage.
- Leftovers noticed in groups 1 and 2, none in the triage, all for 12d or 12e rather than group 3:
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
