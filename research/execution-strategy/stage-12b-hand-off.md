# Stage 12b hand-off

Part of the [Performance Enhancement Execution Strategy](../performance-enhancement-execution-strategy.md).

Written at the end of the 12b session (2026-09-23) so that the pause and 12c can start cold. Stage 12b is
[Behavior discovery](phase-12-plan.md#12b-behavior-discovery): the end-to-end scenarios the 12a tests left to the spec matrix, and
a failure-path pass whose findings are classified, not fixed. No file under `cucumber-tsflow/src` changed.

## State of the tree

- Branch `2026-09-speed-enhancements`, started from `7811636` (the 12a hand-off commit). The 12b work is
  committed as `47842ca` ("Stage 12b: end-to-end scenarios for watch, selective load, parse and load failures;
  failure-path findings") after the owner's review on 2026-09-23; the tree was clean after it, and 12c starts from
  there. `yarn build` unchanged (the library did not change); `yarn test:unit` unchanged at 218 green.
- `yarn test:all` green on all sixteen variants on this machine, with the `node` workspace now at 25 scenarios
  (20 in 12a) and `node-esm` at 18 (15 in 12a); the other twelve counts are as in 12a. The CI matrix written in 12a
  first ran after this commit was pushed, through a **draft pull request** from the branch to `master`: GitHub
  shows the "Run workflow" button only when the default branch's copy of `ci.yml` declares `workflow_dispatch`,
  and master's copy has just the `push` and `pull_request` triggers, so the manual route is not offered in the
  UI. A `pull_request` event uses the workflow file from the PR's own branch, so the five-job matrix is what runs;
  the draft PR stays open for the rest of Phase 12 and every push to the branch reruns it. **First run:** both
  Windows jobs green; all three Ubuntu jobs (Node 22, Node 24, Node 24 with async hooks) failed in `yarn
  test:unit` on one test, `module-graph.test.ts` "returns undefined for anything that is not a well-formed file
  URL", which fed `canonicalFromUrl('file:')` expecting `undefined`: `fileURLToPath('file:')` throws on Windows
  (no drive letter) but names the root directory `/` on POSIX, so the input was malformed only where the test was
  written. The input is now `file:///a%2Fb.js`, which Node rejects on every platform. Nothing else differed on
  Ubuntu: the spec matrix did not run there because the unit-test step comes first. **Rerun after `e5ef8d7`: all
  five jobs green**, the first time the spec matrix has run on Linux and on Node 22; the longest job (Ubuntu, Node
  22) spent about two minutes in `yarn test:all`, the others 23 seconds or less. The 12b gate is closed. The run
  carried one annotation, "Node 20 is deprecated … actions/checkout@v4, actions/setup-node@v4 are being forced
  to run on Node 24": the Node version an action's own code runs on, unrelated to the Node the matrix installs;
  both actions were moved to their v5 majors, which declare Node 24. A second annotation said the `ubuntu-latest`
  label moves from Ubuntu 24.04 to 26.04 between October 19 and November 19, 2026 (actions/runner-images issue
  14748). The workflow depends on nothing the image ships (Node from `setup-node`, Yarn from `.yarn/releases`,
  esbuild's own prebuilt binary), so the label was kept on purpose: the matrix should test what a consumer gets by
  default. If an Ubuntu job turns red in that window with no code change behind it, pin `runs-on: ubuntu-24.04`
  or add an explicit `ubuntu-26.04` entry to see the new image early. In a `node --test` log the failing tests are
  listed at the end under `✖ failing tests:`, and `ℹ fail` gives the count.
- `npx tsc --noEmit -p cucumber-tsflow-specs/node/tsconfig.json` and the same for `node-esm` are clean (the
  spec workspaces have no type-check script; this is what the editor and the ts-node ESM loader see). ESLint and
  Prettier are clean on every step file added or changed.
- Files added: `cucumber-tsflow-specs/features/watch-mode-esm-test.feature`, `selective-load-test.feature`,
  `parse-error-test.feature`, `load-failure-test.feature` (CRLF, like the repository rule; the pre-existing
  `watch-mode-test.feature` is LF and was left so to keep its diff readable);
  `cucumber-tsflow-specs/node/src/step_definitions/cli-run-test.ts` and the `node-esm` twin (identical apart from
  `createRequire(import.meta.url)`); `cucumber-tsflow-specs/node-esm/src/step_definitions/watch-mode-test.ts` (the
  ESM twin of the CJS steps); the fixtures `cucumber-tsflow-specs/node/src/fixtures/broken/two-features.feature`
  and `cucumber-tsflow-specs/{node,node-esm}/src/fixtures/failing/missing-import.ts` (under `// @ts-nocheck`, so
  the unresolvable import does not light up the editor).
- Files changed: `cucumber-tsflow-specs/features/watch-mode-test.feature` (a second scenario that edits files),
  `cucumber-tsflow-specs/node/src/step_definitions/watch-mode-test.ts` (the edit, restore and `Changed:` steps),
  `cucumber-tsflow-specs/node/cucumber.json` (profiles `selective`, `broken`, `missing-import`),
  `cucumber-tsflow-specs/node-esm/cucumber.json` (profiles `watch`, `watch-tsnode`, `missing-import`), and this
  document (findings Y–AH, the stage status lines, this section).

## What 12b landed

- **Watch reruns end to end, both module systems** (risk 3). `watch-mode-esm-test.feature` (`@watch @node-esm`,
  so both `node-esm` profiles run it) has two scenarios. The first starts `-p watch --watch` (es-node-esm, one
  feature, `basic-test.ts` and `world-context.ts`), presses Enter, appends a comment to `basic-test.ts`, then to
  `fixtures/scenario-context.ts` (a project module `world-context.ts` imports, not a support file), quits, and
  asserts four runs of `3 scenarios (3 passed)`, `(rerun N: 2 evaluated again, 0 kept loaded)` on every rerun,
  `Changed: src/step_definitions/basic-test.ts` before rerun 2 with no other modules, and `Changed:
  src/fixtures/scenario-context.ts` before rerun 3 with `1 other module` (the reverse closure through the
  recorded ESM edges). The second starts `-p watch-tsnode --watch` (the `ts-node-maintained/esm` loader), edits
  `basic-test.ts`, and asserts the banner `Support code cannot be kept loaded between runs`, two passing runs, no
  rerun note, and the `Changed:` line: the child-process fallback and its `--no-watch` argv rewrite (finding M's
  untested path) now run in the matrix. The CJS `watch-mode-test.feature` gained the same edit scenario, so the
  `require.cache` reverse closure is covered end to end as well. The steps normalize backslashes (`path.relative`
  prints them on Windows), restore edited files with their original content *and* timestamps in the `@after`
  hook so the outer run's selective-load stamps stay valid, and delete `TSFLOW_ESM_HOOKS` from the child's
  environment so the in-process scenario stays in process on the CI job that forces async hooks.
- **Selective loading's warm path.** `selective-load-test.feature` (`@cli-run @selective @node`) runs the
  `selective` profile (es-node, `basic-test.feature`, five support files) through a `CliRun` child-process
  helper: once to write the index, then again, asserting `3 of 5 support files … (2 skipped: not used by the
  selected scenarios)` and `3 scenarios (3 passed)`; the control runs the same profile with `--no-selective-load`
  and asserts `5 support files` with no skip note. The three that load are `basic-test.ts` (the steps),
  `tag-test.ts` and `world-context.ts` (hooks, so always loaded); `background-test.ts` and
  `scenario-outline-test.ts` are skipped. On CI every earlier run was cold, so this is the first time the skip
  path executes there.
- **Parse errors in the user-visible form** (risk 5). `parse-error-test.feature` (`@cli-run @parse-error @node`)
  runs the `broken` profile, whose only feature is `src/fixtures/broken/two-features.feature` (a second
  `Feature:` line), and asserts `1 parse error` in the parse phase line, `Parse error in
  "src/fixtures/broken/two-features.feature"` on stderr, exit code 2, and that the profile's
  `message:../reports/parse-error.ndjson` stream holds exactly `meta`, `source`, `parseError` and nothing from a
  run. The support code still loads first (`9 step definitions` in the load line), as the unit test records.
- **A load failure names the file and exits 1.** `load-failure-test.feature` (`@cli-run @load-failure @node
  @node-esm`) runs the `missing-import` profile of each workspace (two good support files plus the fixture whose
  import cannot be resolved) and asserts the load line closes with ` failed, <n>ms`, stderr names
  `src/fixtures/failing/missing-import.ts`, stdout carries no escape sequences, exit code 1. This is
  `progress.end('failed')` / `progress.finish()` from Phase 10 under test on both module systems.
- **The failure-path pass.** Driven with two scratch scripts (a plain run capturing both streams and the exit
  code; a watch driver that waits for `Run took`, sends keys and edits files), on the `node` and `node-esm`
  workspaces with temporary profiles in a scratch configuration file, on this machine (Windows, Node 24.16):

  | Case | Plain run | Watch mode | Exit code | Classified as |
  | --- | --- | --- | --- | --- |
  | Syntax error in a support file (esbuild, CJS and ESM) | load line `failed`; esbuild's `X [ERROR]` names file and line; then `[tsflow:cli]` and `[tsflow:run]` repeat it | same per run; rerun on Enter fails again; quit crashes | 1 (plain); 1 from the crash (watch) | AB (duplication, broken phase line), AA (crash) |
  | Syntax error under `ts-node` CJS | `TSError: ⨯ Unable to compile TypeScript: src/fixtures/failing/syntax-error.ts(8,1)`, once from ts-node, twice from tsflow | not run | 1 | AB |
  | Syntax error under `ts-node-maintained/esm` | `undefined: undefined`, no file | not run | 1 | AC |
  | Missing import (CJS) | `Cannot find module './does-not-exist'` with the require stack naming the fixture first | survives, reruns, quit crashes | 1 / 1 | now a spec; AA |
  | Missing import (ESM esbuild) | `Failed to resolve ./does-not-exist … imported from …missing-import.ts` | same | 1 / 1 | now a spec; AA |
  | Missing import (ts-node ESM) | `undefined: undefined` | not run | 1 | AC |
  | `BeforeAll` that throws (CJS and ESM) | nothing printed, `3 scenarios (3 passed)` | same | 2 | Z |
  | Malformed feature | `1 parse error`, `Parse error in "…"`, support loaded, nothing run | not run | 2 | now a spec |
  | Ctrl-C | `child.kill()` only (Windows) | `\x03` through stdin quits like `q` | — | AH |
  | `--config` with an absolute path | `Configuration file … failed to load/parse` | — | 1 | Y |

  No escape sequence appeared on either stream in any piped run, and every process exited on its own.
- **Real-console verification** with the `verify-console-output` skill (preflight passed: `isTTY=true`,
  glyphs single-cell, worker TTY stream ok). The `missing-import` profile of the `node` workspace was run in a
  fresh console at 120 and 80 columns, in watch mode (Enter after the first run, then `q`) and as a plain run.
  The dumps show every phase line closed on its own rows (`[ ✓ ] Packing the jars — … failed, 350ms`), no stale
  spinner frame, wrapped lines complete at 80 columns, the next line at column 0, `Watch mode stopped.` printed,
  and the cursor at column 0 of the row after the last text. Findings AD (the check mark on a failed phase) and
  the visible half of AB come from these dumps. The harness pipes the child's stdin, so raw mode was never
  entered and its restoration was not observed (AH).

## Notes specific to the pause and 12c

- The gate is met as far as this machine can tell: `test:all` green with the seven new scenarios (four features)
  on both profiles of the two workspaces that run them; every failure-path case above is classified. The CI
  matrix is running on the draft pull request (see the state of the tree) and covers Ubuntu and Node 22, which
  nothing on this branch had touched; its result is the last item of the 12b gate and the first thing 12c reads.
- Findings A–X were not pruned in the 12a pause and Y–AH join them; **pruning the whole list with the owner is
  the first act of 12c**, before any refactor. The 12b fixes that are not in doubt: Z (both adapters), AA
  (one guard), AB (`logLevel: 'silent'` plus one report site), AC (rethrow a plain `Error` in the ts-node loader,
  format non-`Error` throwables), AD and AF (one line each). AE is a decision. Y, AG and AH are closed.
- Running one new feature: from the workspace, with its outer profile and the feature path, for example
  `node ../../cucumber-tsflow/bin/cucumber-tsflow.js -p esnode ../features/selective-load-test.feature` in
  `cucumber-tsflow-specs/node`, or `-p esnodeesm ../features/watch-mode-esm-test.feature` in `node-esm`
  (positional paths replace the profile's). The watch scenarios take 5–15 s each (the ts-node fallback is the
  slow one, about 2 s per run); the whole `node` workspace runs in about 10 s more than before. Run watch
  features from one workspace at a time: they edit `basic-test.ts` and `fixtures/scenario-context.ts` in place.
- The `selective` scenario's numbers (`3 of 5`, `2 skipped`) follow from which step files register hooks; a hook
  added to `background-test.ts` or `scenario-outline-test.ts` changes them, and the feature's description says
  why each file loads so the next person can recompute.
- The `CliRun` and `WatchSession` helpers type the child environment as `Record<string, string | undefined>`
  because ESLint's `no-undef` cannot see `NodeJS.ProcessEnv` (finding R) and a spread of `process.env` loses its
  index signature under `strict`. When R is resolved in 12d the plainer type can return.
- `--require` / `--import` on the command line append to a profile's lists (used during the pass to add a
  fixture to a profile without editing it); `--config` must be cwd-relative (finding Y).
- Build with `yarn build`, never bare `tsc`; run `yarn test:unit` and `yarn test:all` before calling a stage done.

## Starting 12c

Written for a fresh session. 12c is [Review refactors](phase-12-plan.md#12c-review-refactors): the triaged findings, one concern
per commit, then the closing measurement. **The triage is done** (2026-09-23, with the owner) and recorded in
[12c triage](phase-12-plan.md#12c-triage); the execution session starts with group 1 and does not reopen the dispositions.

- **Read first:** the [12c triage](phase-12-plan.md#12c-triage) table (every letter's disposition, group and verifying test), the
  [review findings](phase-12-plan.md#review-findings-for-strand-2) A–AH for the detail behind each row, the
  [12a hand-off](stage-12a-hand-off.md) for what each unit-test file covers (the net for every refactor), and this
  hand-off's failure-path table for the reproductions behind group 1.
- **Start state:** the 12b commit plus the triage commit, clean. `yarn`, `yarn build`, `yarn test:unit` (218) and
  `yarn test:all` (sixteen variants; `node` 25, `node-esm` 18) reproduce the gate. The CI matrix on the draft
  pull request was green at the end of 12b.
- **Cadence, decided by the owner:** after every commit, `yarn build`, the strict type-check on the touched files
  (`npx tsc --noEmit -p tsconfig.node.json --strictNullChecks` from `cucumber-tsflow`, filtered to the edited
  files), `yarn test:unit`, and the one spec variant that covers the change (for example
  `yarn test:node:cjs-esbuild`, or the `*-exp*` variants for J, the Vue variants for I). The full `yarn test:all`
  runs at each group boundary and once more before the measurement. Each group closes with a one-line note in the
  12c hand-off saying the boundary matrix was green.
- **Group 1, the 12b fixes**, each small with a spec waiting: AA (guard `global.messageCollector` in
  `cli/run.ts`; then add the watch scenario "survives a failing run" on the `missing-import` profile: Enter after
  the failed first run, quit, exit code 2, no stack trace after `Watch mode stopped.`), Z (report the hook error
  and emit the envelopes in `runtime/worker.ts`, fail the run in `runtime/parallel/worker.ts`; a
  `before-all-throws` fixture and a scenario asserting the message names the hook's file and line and the exit
  code), AB (`logLevel: 'silent'` in both esbuild transpilers, one report after `progress.end('failed')`, drop the
  repeated `[tsflow:*]:ERROR` copies; the load-failure spec then asserts the message appears once), AC (rethrow in
  `tsnode-loader.mjs`, format non-`Error` throwables in `tsflow-logger.ts`; a unit test with a null-prototype
  object), AD (failure mark in `PhaseRenderer.finished()`), AE (close the launch phase line before the `BeforeAll`
  hooks run) and AF (`describeTranspiler` in the async-hooks banner). AB, AD and AE change what a console shows;
  verify them together with the `verify-console-output` skill once, at the end of the group.
- **Group 2, dead code:** A, B, C, K/V, L. No behavior change; the strict type-check and the unit tests are the
  whole proof. Do this before group 5 because A removes types from `api/load-support.ts`, which D rewrites.
- **Group 3, pure helpers:** E (one path-normalization helper), F (one stamp shape).
- **Group 4, the transpiler layer:** H first, and it starts with a look, not an edit: find out whether
  `esm/esbuild.mjs` rejecting `.ts` in `supports()` is deliberate before aligning or renaming. Then I (rewrite
  before caching; the path mappings join the Vue cache key), then J (one decorator-mode value, one form across the
  thread boundary). These share `transpilers/esbuild.ts`, `esm/esbuild.mjs`, `esm/loader-utils.mjs` and
  `vue-sfc-compiler.ts`; doing them back to back avoids editing the same code three times.
- **Group 5, loading and eviction:** D/U together (one eviction implementation, `getSupportCodeLibrary()` owning
  it, `reloadSupport()` clearing the registry and notifying listeners), then N (the `watch` profile sets
  `watch: true`, the spec drops `--watch`). Run the watch features from one workspace at a time; they edit files
  in place.
- **Group 6, the measurement** closes the stage: the UIS suite (`dim`, the full suite, fresh process and one
  `--watch` rerun) against the Phase 10 clean reference, after checking for stray filesystem scanners as the
  Phase 11 notes describe, plus one A/B pair with the compile cache in `bin/cucumber-tsflow.js` on and off for
  finding P. If it moved, stop and look before anything else.
- **Closed or moved, do not touch in 12c:** M (by design), X (deferred), G and AG (12e documentation), Q, R and W
  (12d), S, T, Y, AH (done).
- **What not to do in 12c:** no spelling or strict-mode sweeps (12d), no documentation beyond this file and the
  CHANGELOG entries for the fixes (12e).
