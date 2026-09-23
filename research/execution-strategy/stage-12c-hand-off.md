# Stage 12c hand-off

Part of the [Performance Enhancement Execution Strategy](../performance-enhancement-execution-strategy.md).

Written as the groups land (started 2026-09-23), so that a pause after any group can resume cold. Stage 12c is
[Review refactors](phase-12-plan.md#12c-review-refactors): the triaged findings in six groups, one concern per commit. **Group 1
is complete; groups 2–6 have not started.**

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
  25 and `node-esm` 18 after 12b; the other twelve are unchanged since Phase 10). The CI matrix on the draft pull
  request has not run on these commits: nothing was pushed in this session.
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

## Notes specific to the pause and group 2

- **Group 1 boundary: `yarn test:all` green on all sixteen variants (counts above).** Groups 2–6 remain, in
  the order the plan gives; group 2 (A, B, C, K/V, L) is next and needs no spec changes.
- Leftovers noticed while doing AB, not in the triage: `api/load-configuration.ts` (ten sites) and
  `api/convert-configuration.ts` (two) still log with `logger.error` before rethrowing, so a configuration error
  prints `[tsflow:config]:ERROR …` and then the `[tsflow:run]` report, two copies. Same mechanical change as the
  loaders; a candidate for group 2 or 12d. Also: in a parallel run where no test case ever starts (the
  BeforeAll spec's second scenario), the formatter's summary prints before the launch phase line closes, because
  the phase closes after `runtime.run()` resolves and the formatter's `testRunFinished` listener was registered
  first; cosmetic, pre-existing.
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
