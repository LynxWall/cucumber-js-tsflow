# UIS Tools full suite: 7.5.5 against 8.0.0

Part of the [speed-enhancement project](../README.md).

The comparison the team asks for first: the whole UIS Tools suite on the version it runs, 7.5.5, against the
release. Taken on 2026-09-25 during the release review. Every earlier measurement in this project compared one
branch build with another; this is the first against the version in use.

## Result

On a clean run, the full suite takes **about 15 minutes on 7.5.5 and 4½ to 6 minutes on 8.0.0**. The wait before
the first scenario drops from about 5½ to 6 minutes to 15 to 25 seconds.

| | 7.5.5 | 8.0.0, warm transpile cache | 8.0.0, cold transpile cache |
| --- | --- | --- | --- |
| Whole run, wall clock | 15m 28s, 14m 59s | 4m 35s | 6m 12s |
| Before the first scenario | 6m 02s, 5m 27s | 15 s | 24 s |
| Test run (Cucumber's own figure) | 9m 26s, 9m 32s | 4m 20s | 5m 48s |
| Of which outside the step bodies | 2m 26s, 2m 28s | 7 s | 6 s |

The cold-cache column is what a CI agent without a restored `node_modules/.cache` sees; the warm column is a
developer's second run.

## Where the time went

- **Startup, about 6 minutes to 15 seconds.** On 7.5.5 the time before the first scenario was the esbuild ESM
  loader routing all 971 transpiled files through a ts-node service on Node's loader-hooks thread, and
  `source-map-support` issuing a synchronous XMLHttpRequest under jsdom for every one of the 218 support files
  while the decorators resolved their callsites (about 0.7 s each; see [decisions.md](../decisions.md)). On 8.0.0
  the loader runs in-thread and calls esbuild directly, callsite resolution avoids jsdom's request path, and a warm
  transpile cache serves all 971 transpiles from disk: support loading takes 6.4 s, assembling the 1,624 test cases
  5 s.
- **The test run, 9½ minutes to 4½.** Cucumber reports two figures for a run: its duration, and the time spent
  executing steps. On 7.5.5 the gap between them was 2m 26s; on 8.0.0 it is 6 to 7 s. That gap is the runner's
  own work between steps. On 7.5.5 it included, for every one of the 7,305 steps, re-filtering the step hooks and
  scanning the definition lists; 8.0.0 selects the hooks once per scenario and looks definitions up through
  indexes (Phase 2). The executing-steps figure itself fell from
  7m 00s to 4m 14s (warm) and 5m 41s (cold). 7.5.5 also looked up each step's scenario context by scanning all
  1,624 scenarios and matching step texts, inside each step's invocation, so part of that fall is the same kind of
  cost; the rest is run-to-run variation, which on this machine is large.
- **Phase 2 had measured no change in the test run** on the `dim` profile (334 scenarios). These costs grow with
  scenarios times steps, so they barely show at 334 scenarios and take minutes at 1,624.

## Setup

- UIS Tools `develop` at `86d8bb797` (2026-09-24), checked out as a separate git worktree so that no working
  checkout changed. The command was `pnpm -F uis-tools-test test` in `Tools.Web/VueApp`, which runs
  `cucumber-tsflow -p default`: 214 feature files, 1,624 scenarios, 7,305 steps, 218 support files, `es-vue-esm`,
  experimental decorators, serial, with the `behave`, `html` and `junitbamboo` formatters writing to files.
- 7.5.5 is the registry version `develop` locks, installed with `pnpm install --frozen-lockfile`. 8.0.0 is this
  repository's build of the release tree, linked in with `link:` as in
  [testing/local-consumer-testing.md](../testing/local-consumer-testing.md). It was built before the version bump,
  so its bootstrap line says 7.8.0; nothing else differs. The comparison covers everything between the two
  versions, including 7.6 and 7.7, which UIS never took; the branch was cut from 7.7.2, and the earlier
  measurements in this project compare against that.
- Windows 11, Node 24.16.0, the developer laptop the work was done on, in use during the day. The CPU load was
  sampled before each run. Wall clock includes pnpm's start (about 1 s). "Before the first scenario" is the wall
  clock minus Cucumber's test-run duration.

## Every run

Runs are listed in the order they were taken. A run is marked disturbed when something outside it held the
machine: a high CPU load before it started, a bootstrap or support load several times its usual length, or step
execution far above the other runs'. Disturbance only ever adds time, so the clean runs are the comparison, and
the disturbed ones are kept for the record.

| Run | Version | Transpile cache | CPU before | Wall | Test run | Executing steps | Outside steps | Before first scenario | Reading |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| released-1 | 7.5.5 | none | 71% | 19m 38s | 11m 47s | 8m 49s | 2m 58s | 7m 51s | disturbed: first run after the install, machine loaded |
| released-2 | 7.5.5 | none | 19% | 15m 28s | 9m 26s | 7m 00s | 2m 26s | 6m 02s | clean |
| branch-1 | 8.0.0 | cold | 23% | 8m 38s | 5m 01s | 4m 55s | 6 s | 3m 37s | warm-up: first run after linking, support load 3m 05s while the new files were read for the first time |
| branch-2 | 8.0.0 | cold (cleared) | 11% | 6m 12s | 5m 48s | 5m 41s | 6 s | 24 s | clean; support load 15.8 s |
| branch-3 | 8.0.0 | warm | 51% | 14m 02s | 13m 29s | 13m 12s | 17 s | 33 s | disturbed: step execution nearly three times the clean runs'; 4 step timeouts |
| branch-4 | 8.0.0 | warm | 59% | 19m 32s | 13m 39s | 13m 20s | 19 s | 5m 53s | disturbed: bootstrap 35.2 s, support load 4m 57s; 4 step timeouts |
| branch-5 | 8.0.0 | warm | 45% | 13m 20s | 12m 53s | 12m 35s | 18 s | 27 s | disturbed step execution; startup clean (support load 18.9 s) |
| branch-6 | 8.0.0 | warm | 16% | 5m 50s | 4m 51s | 4m 42s | 9 s | 59 s | startup partly disturbed: bootstrap 8.9 s, support load 39.3 s |
| branch-7 | 8.0.0 | warm | 22% | 4m 35s | 4m 20s | 4m 14s | 7 s | 15 s | clean: bootstrap 557 ms, support load 6.4 s, assembly 5.0 s |
| branch-8 | 8.0.0 | warm | 20% | 7m 58s | 4m 05s | 3m 59s | 6 s | 3m 53s | startup disturbed: bootstrap 17.9 s |
| released-3 | 7.5.5 | none | 19% | 14m 59s | 9m 32s | 7m 04s | 2m 28s | 5m 27s | clean, after a fresh install |
| released-4 | 7.5.5 | none | 43% | 21m 41s | 13m 42s | 10m 12s | 3m 30s | 7m 59s | disturbed: step execution 45% above the clean runs' |

Every run passed all 1,624 scenarios except branch-3 and branch-4, which are covered below. Another agent session
was busy in a different repository all afternoon, and it most likely caused the disturbances; the rule in
[testing/local-consumer-testing.md](../testing/local-consumer-testing.md) about concurrent sessions held again.

## What else the measurement found

- **The four failures were load, not the release.** In branch-3 and branch-4, four scenarios of
  `features/dim/suites/tests-in-suite.feature` failed: `SuiteContainer create form has valid values` hit the
  default 5-second step timeout. Both runs took 13 minutes to execute steps, against 4 to 5 in the clean runs. The
  same feature, run alone on the same warm cache, passed 17 of 17, and every clean run passed it. A step that needs
  several seconds on a quiet machine times out on a loaded one, which is worth knowing for loaded CI agents.
- **7.5.5 depends on pnpm hoisting a package it does not declare.** After the worktree was switched from 7.5.5 to
  the `link:` build and back with `pnpm install --frozen-lockfile` (and again with `--force`), 7.5.5 could not
  start: `Cannot find module '@cucumber/messages'`, required from its `lib/api/run-cucumber.js`. 7.5.5 imports
  `@cucumber/messages` without declaring it and relies on pnpm's hidden hoist to supply it from
  `@cucumber/cucumber`'s tree; the reinstall did not restore the hoist, and only removing every `node_modules`
  folder and installing afresh did. 8.0.0 declares every package it imports.

## Reproducing it

```sh
# in the UIS Tools repository: a worktree of develop beside the main checkout
git worktree add --detach ../uis-tools-develop origin/develop
cd ../uis-tools-develop/Tools.Web/VueApp
corepack pnpm install --frozen-lockfile
corepack pnpm -F uis-tools-test test          # 7.5.5; time it, and take more than one run

# the release build, from this repository's cucumber-tsflow folder (yarn build first)
corepack pnpm add -D -w "@lynxwall/cucumber-tsflow@link:../../../../GitHub/cucumber-js-tsflow/cucumber-tsflow"
corepack pnpm -F uis-tools-test test          # discard the first run after linking

# afterwards, from the main checkout (pnpm's nested paths can exceed Windows' path limit; delete the folder with
# PowerShell's \\?\ prefix if git cannot)
git worktree remove --force ../uis-tools-develop
```

The `link:` path assumes the two repositories sit side by side as described in
[testing/local-consumer-testing.md](../testing/local-consumer-testing.md). Take the runs with nothing else running,
and discard any run whose CPU load, bootstrap or step-execution time stands out.
