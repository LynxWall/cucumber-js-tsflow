# Testing a Local Build Against UIS Tools

The spec matrix in this repository is 28 scenarios across 8 feature files. None of the costs identified in
the performance analyses are visible at that size, so every change on the
[execution strategy](performance-enhancement-execution-strategy.md) worklist needs a large real consumer
to be measured against. This document describes how the local build is wired into one.

## The consumer

`C:\Git\Azure\uis-tools\Tools.Web\VueApp` is a pnpm 11 workspace (`packageManager: pnpm@11.13.1`) with
three member packages: `e2e`, `test` and `tools`. The `test` package (`uis-tools-test`) is the relevant
one:

| Property | Value |
| --- | --- |
| Feature files / scenarios | 207 / 1571 (6992 steps, measured 2026-09-17; the earlier ~1380 estimate was low) |
| Step-definition files | 208 under `test/steps/` |
| Transpiler | `es-vue-esm` with `experimentalDecorators: true` |
| Parallelism | none — no profile sets `parallel` or `parallelLoad` |
| Node | 24.16.0 (`engineStrict: true`) |
| Vue | 3.5.17 |

`@lynxwall/cucumber-tsflow` is declared once, as a `devDependency` of the **workspace root**
`package.json`, and both `test` and `e2e` reach the `cucumber-tsflow` bin through pnpm's root
`node_modules/.bin`. The registry version in use before this setup was `~7.5.5`; the local build is `7.7.2`.

Profiles live in `test/cucumber.json`. Sizes, for picking an inner-loop target:

| Profile | Features | Scenarios | Imports |
| --- | --- | --- | --- |
| `utils` | 3 | 49 | `test-setup.mjs`, `world-context.ts`, `steps/utils/**` |
| `alerts` | 2 | 11 | `test-setup.mjs`, `world-context.ts`, `steps/alerts/*` |
| `dim` | 32 | 334 | subset (200 files through the ESM hooks) |
| `default` | 207 | 1571 | `test-setup.mjs`, `steps/**/*.ts` — 974 files loaded, 2578 `load` / 9632 `resolve` hook calls |

Because no profile is parallel, the N+1 process-multiplier costs in the analyses do not apply to this
consumer. What does apply, at full scale, is every serial cost: item 2's whole-run `pickleMap` scan
(1380 pickles), and the entire ESM load path across 208 support files.

## How it is wired

The root `package.json` of the UIS workspace points at this repository's library package with a `link:`
specifier instead of a version range:

```json
"@lynxwall/cucumber-tsflow": "link:../../../../GitHub/cucumber-js-tsflow/cucumber-tsflow"
```

It was added with:

```sh
cd C:\Git\Azure\uis-tools\Tools.Web\VueApp
corepack pnpm add -D -w "@lynxwall/cucumber-tsflow@link:../../../../GitHub/cucumber-js-tsflow/cucumber-tsflow"
```

pnpm writes the path with backslashes on Windows; it was normalized to forward slashes by hand and
`corepack pnpm install` rerun so the lockfile agrees.

`pnpm` is not on the Git Bash `PATH` on this machine; `corepack pnpm …` from inside the UIS directory
picks up the pinned version from the `packageManager` field.

### Why `link:` and not a tarball

`link:` makes `node_modules/@lynxwall/cucumber-tsflow` a symlink to
`C:\Git\GitHub\cucumber-js-tsflow\cucumber-tsflow`. Node resolves through the symlink to the real path, so:

- **The inner loop is `yarn build` and rerun.** No pack, no reinstall. For performance work that is
  rebuilt many times a session this is the deciding factor.
- **The library's own dependencies** (`@cucumber/cucumber`, `esbuild`, `ts-node-maintained`, `jsdom`, …)
  resolve from this repository's root `node_modules` — the Yarn workspace uses `nodeLinker: node-modules`,
  so they are present. These are the same versions a tarball install would pull.
- **One fidelity difference:** `vue-sfc-compiler.ts` imports `vue/compiler-sfc`, which the library does
  not declare as a dependency. Under a registry or tarball install pnpm's hidden hoist
  (`node_modules/.pnpm/node_modules`) supplies UIS's Vue 3.5.17. Under `link:` it resolves from this
  repository's `node_modules` — Vue **3.5.13**. A patch-level compiler difference against a 3.5.17
  runtime; acceptable for timing work, but it means the linked setup is not a packaging test.

A `file:` tarball (`yarn workspace @lynxwall/cucumber-tsflow pack` → `"file:../path/to/x.tgz"`) is the
faithful install: it honours the `files` allowlist, installs through pnpm's store, and gets UIS's Vue.
It costs a pack plus `pnpm install` per iteration, and pnpm has been known to cache `file:` tarballs by
path, so a version bump or store prune may be needed to pick up changes. Use it as a final check before a
release, not for iteration.

### pnpm workspace policies to be aware of

`pnpm-workspace.yaml` sets `trustPolicy: no-downgrade`, `blockExoticSubdeps: true` and
`minimumReleaseAge: 2880`. None of them rejected the `link:` install. If a `file:` tarball is ever
refused on trust grounds, the escape hatch is a `trustPolicyExclude` entry for
`@lynxwall/cucumber-tsflow@<version>`.

## Running

```sh
# in this repository — after any source change
yarn build

# in C:\Git\Azure\uis-tools\Tools.Web\VueApp
corepack pnpm -F uis-tools-test testUtils      # 49 scenarios, ~30 s — inner loop
corepack pnpm -F uis-tools-test testDim        # 334 scenarios, ~40 s warm
corepack pnpm -F uis-tools-test test           # full 1571 scenarios, ~4 min warm — the real measurement
```

Wall-clock is what matters, not the `executing steps` figure cucumber prints; on the `utils` profile the
steps take well under a second and everything else is startup. Wrap the command in `time` or a
`$SECONDS` delta.

**Discard the first run after any `pnpm install` or `yarn build`.** Freshly written files under
`node_modules` or `lib/` are read for the first time on that run, which on this Windows machine pays both a
cold filesystem cache and on-access antivirus scanning. The effect is not small — see the table below — so
a measurement is the steady state of runs two onward, never run one.

**Check for stray filesystem scanners before measuring.** A run can also be disturbed by another process
competing for the disk: in Phase 11 an orphaned Git Bash `find / -maxdepth 8 …` from the previous day made every
startup phase about three times its clean figure, including the ones that load nothing (`gherkin`, transpile-cache
hits), and repeated runs did not settle. `Get-Process | Sort-Object CPU -Descending | Select-Object -First 8` finds
such a process; a `gherkin` row at three times its usual 170 ms is the signature. See the Phase 11 hand-off in the
execution strategy.

## First measurements

Serial `utils` profile, Node 24.16.0, same machine, same session, in the order they were run:

| Run | Build | Scenarios | Executing steps | Wall clock |
| --- | --- | --- | --- | --- |
| 1 | `7.5.5` (registry; first run of the session) | 49 passed | 0.31 s | 107 s |
| 2 | `7.7.2` (this repo, `master`; first run after `pnpm add`) | 49 passed | 0.17 s | 34 s |
| 3 | `7.7.2` (first run after a lockfile-only `pnpm install`) | 49 passed | 0.21 s | 11 s |
| 4 | `7.7.2` | 49 passed | 0.16 s | 11 s |
| 5 | `7.7.2` | 49 passed | 0.15 s | 9 s |

Two conclusions. First, the warm-up penalty is 3–10× the steady-state time, which is why the rule above
exists. Second, the `7.5.5` figure is a single cold run and says nothing reliable about what 7.6–7.7
already recovered; it would need to be re-measured warm to be compared. The steady-state `7.7.2` figure —
roughly **9–11 s** for `utils`, of which under 0.2 s is step execution — is the baseline for the
performance worklist. Every change should be measured as a delta from an unmodified `master` build.

The `utils` profile is the inner loop, not the measurement: it loads `world-context.ts` and three files
under `steps/utils/`, not the 208-file support tree. The `default` profile is what the analyses were
written about; it was first timed and profiled in Phase 7 (see the Phase 7 hand-off in the execution strategy):
warm startup about 9.1 s, of which `support:import` 7.7 s, and `runtime:run` 196–224 s.

## Selective loading on this suite

The `selectiveLoad` option (Phase 9) keeps its index at
`test/node_modules/.cache/cucumber-tsflow/selective-load/<sha256>.json`, next to the transpile cache, one file
per configuration (the key covers the working directory, the support-code coordinates, the decorator mode and the
library version, so each profile has its own). Delete that directory to start cold. On this suite 12 of the 216
support files always load — `test-setup.mjs`, `steps/world-context.ts` and the 10 step files that also declare
hooks — and the rest are candidates to skip. To measure a filtered run with and without it:

```sh
cd C:/Git/Azure/uis-tools/Tools.Web/VueApp/test
TSFLOW_TIMING=true TSFLOW_THEME=off node ../node_modules/@lynxwall/cucumber-tsflow/bin/cucumber-tsflow.js \
  -p default --name "Loading indicator displays while reviews are loading"                   # baseline
TSFLOW_TIMING=true TSFLOW_THEME=off node ../node_modules/@lynxwall/cucumber-tsflow/bin/cucumber-tsflow.js \
  -p default --selective-load --name "Loading indicator displays while reviews are loading"  # first run writes the index
```

The Phase 9 hand-off in the execution strategy has the numbers.

## Watch mode on this suite

`--watch` (Phase 10) keeps one process alive and reruns on Enter or on a file change, keeping every module
loaded except the support files that registered something, the changed files and their dependents. The
measurement of interest is the startup of a rerun against the startup of a fresh process, with the run itself
unchanged. Because the captured shell is not a TTY, drive the process through piped stdin: the scratch script
used in Phase 10 spawns the CLI with `--watch`, waits for the `Run took` status line after each run, writes `\n`
for a rerun and `q` to quit, and can edit a file between runs. Its essentials, for a one-scenario inner loop:

```sh
cd C:/Git/Azure/uis-tools/Tools.Web/VueApp/test
# stdin is a pipe: each "\n" is a rerun, "q" quits; TSFLOW_THEME left on so the rerun note appears on the load line
printf '\n\nq' | TSFLOW_TIMING=true node ../node_modules/@lynxwall/cucumber-tsflow/bin/cucumber-tsflow.js \
  -p default --watch --name "Loading indicator displays while reviews are loading"
```

`printf` delivers all three keys at once; the loop queues one rerun while a run is in progress and quits after
the current run, so this gives two runs, not three — a script that waits for each `Run took` line before
writing the next key gets the exact count. Read each run's `TSFLOW_TIMING` report (the timing store is reset
per run, so every report covers one run) and the load-phase line's `(rerun N: A evaluated again, B kept
loaded, C other modules)` note. The Phase 10 hand-off in the execution strategy has the numbers.

## Profiling a run

Item 27 of the [execution strategy](performance-enhancement-execution-strategy.md) asks where the time
inside `runtime:run` goes. `TSFLOW_TIMING` cannot answer that — it brackets the whole runtime as one
phase — so the tool is V8's sampling profiler, `node --cpu-prof`, and a script in this repository that
splits the samples by layer.

### Capture

Run the CLI's bin file directly from the UIS `test` directory, where `cucumber.json` lives. Do not put
`--cpu-prof` in `NODE_OPTIONS` and go through `corepack pnpm …`: corepack and pnpm are Node processes too
and write their own profiles into the same directory. The bin does not respawn Node, so the process being
profiled is the one that runs the steps.

```sh
# profiles are gitignored under research/profiles/ in this repository; never write them under the UIS checkout
OUT=C:/Git/GitHub/cucumber-js-tsflow/research/profiles/dim-run1
mkdir -p "$OUT"

cd C:/Git/Azure/uis-tools/Tools.Web/VueApp/test
TSFLOW_TIMING=true TSFLOW_THEME=off \
  node --cpu-prof --cpu-prof-dir="$OUT" \
  ../node_modules/@lynxwall/cucumber-tsflow/bin/cucumber-tsflow.js --profile dim \
  > "$OUT/console.log" 2>&1
```

- `TSFLOW_TIMING=true` puts the startup timing report in `console.log` next to the profile; its
  `runtime:run` row is the denominator the split is checked against.
- `TSFLOW_THEME=off` keeps the startup-progress spinner worker out of the capture on a real console. In a
  captured shell stdout is not a TTY and the worker never starts anyway.
- `--cpu-prof` writes one file per thread, `CPU.<date>.<time>.<pid>.<tid>.<seq>.cpuprofile`; the main
  thread is `tid` 0. The `dim` profile is serial with no `parallelLoad`, so exactly one file is expected.
  The default sampling interval is 1 ms; a 50 s run produces a 4–5 MB file.
- Three runs, discard the first, as for every measurement here. `runtime:run` varied 37–47 s across clean
  runs of one build in Phase 5, so compare the layer percentages, not the milliseconds.

### Attribute

```sh
cd C:/Git/GitHub/cucumber-js-tsflow
node research/scripts/attribute-cpuprofile.js research/profiles/dim-run1/CPU.*.0.*.cpuprofile
```

The script prints, for the `runtime:run` window, self and inclusive time by layer — `tsflow`
(`…/cucumber-js-tsflow/cucumber-tsflow/lib/`, the linked real path), `cucumber-js` (`@cucumber/*`),
`jsdom` and its helper packages, `vue` and its ecosystem, `esbuild`, `source maps`, `other dependencies`
(with a per-package table), `node internals`, the V8 pseudo-frames `(idle)`, `(program)` and
`(garbage collector)`, and `consumer` (any file outside `node_modules`, with a per-file table) — then
tsflow's share by `lib/` directory and the hot functions overall and within tsflow. A builtin frame with no
file (`readFileUtf8`, a regex exec, a sort) is charged to the nearest caller that has one, so a builtin
called from tsflow counts as tsflow; the hot tables still name it.

The window starts at the first sample with a `lib/runtime/` frame on the stack (`Coordinator.run`, an
adapter's `run`, `runBeforeAllHooks`, `runTestCase` or a `TestCaseRunner` method) and runs to the end of
the profile, so it includes the cleanup tail after the runtime (formatters flushing reports, the timing
report itself). `--all` attributes the whole profile, `--from-ms`/`--to-ms` set an explicit window,
`--start-marker=<regex>` changes the marker, `--top=N` sizes the tables and `--json` emits the same data
as JSON. Run it with `--all` on a worker-thread profile; the marker never appears there.

Checked on the `utils` profile (71 scenarios, `runtime:run` 154 ms in the timing report; 276 ms attributed
including the tail) and on a `vue-esm` spec run, then used for the Phase 7 `dim` and `default` measurements,
where the window matched the `runtime:run` row to within 20 ms and 1.4 s respectively. The full-suite profiles
are 100–130 MB; give Node room with `--max-old-space-size=8192` when attributing them, and do not run the
attribution while another measurement is in flight — it disturbed the startup rows of two runs in Phase 7.

## Undoing it

The `link:` entry and the corresponding `pnpm-lock.yaml` changes are in the UIS working tree and must not
be committed. To restore the registry package:

```sh
cd C:\Git\Azure\uis-tools\Tools.Web\VueApp
git checkout -- package.json pnpm-lock.yaml
corepack pnpm install
```

The UIS branch at the time of setup (`jira/UIST-318`) already carried unrelated local edits to
`package.json`, so `git checkout` of that file will discard those too — review `git diff package.json`
first and revert only the `cucumber-tsflow` line if the rest should stay.
