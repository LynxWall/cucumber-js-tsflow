# Phase 10 hand-off

Part of the [Performance Enhancement Execution Strategy](../performance-enhancement-execution-strategy.md).

Written at the end of the Phase 10 session (2026-09-18) so that Phase 11 can start cold. Phase 10 landed item 23:
`--watch`, a resident process that reruns on file changes or Enter and keeps the support code loaded between runs.

## State of the tree

- Branch `2026-09-speed-enhancements` (earlier hand-offs call it `2026-09-performance-enhancements`); Phase 9 ended
  at `9d7565d`. Phase 10 is committed as `66bec31` ("Watch mode: one resident process that reruns on file changes or
  Enter"), after the owner's code review on 2026-09-22 and a fresh green `yarn test:all` on all sixteen variants. That
  commit also carries the Phase 11 notes and the new [Phase 12 scope](phase-12-plan.md#phase-12-scope). The tree was clean after it;
  Phase 11 starts from there.
- `yarn build` clean, no stray `.js` under `src/`; ESLint and Prettier clean on every touched source file (the
  Markdown files were not Prettier-clean before this phase and were not reformatted). `yarn test:all` green on all
  sixteen variants on the final build (the `node` workspace now runs 20 scenarios: the new `watch-mode-test.feature`
  spawns the CLI in watch mode on both the `esnode` and `tsnode` profiles).
- Files added: `src/api/support-reloader.ts` (`SupportReloader`), `src/api/builder-fingerprint.ts` (the builder
  fingerprint `selective-load.ts` used to keep privately, now shared), `src/cli/watch.ts` (`watchCucumber`, the
  loop), `cucumber-tsflow-specs/features/watch-mode-test.feature` and
  `cucumber-tsflow-specs/node/src/step_definitions/watch-mode-test.ts` (a spec that drives the CLI in watch mode
  through stdin), and a `watch` profile in `cucumber-tsflow-specs/node/cucumber.json` for that spec to run.
- Files changed: `src/utils/module-graph.ts` (reverse closure `dependentProjectModules()`, `evictRequiredModules()`,
  `bumpModuleVersions()` / `versionedUrl()`, `knownProjectModules()`, `canonicalFromFrameFile()`, `withoutQuery()`,
  reload listeners), `src/api/run-cucumber.ts` (optional fourth `session` argument, `ITsFlowRunSession`; the
  load-phase note; `progress.finish()` on a failed load), `src/api/support.ts` (`composeRecorders()`; imports go
  through `versionedUrl()`), `src/api/register-loaders.ts` (`module.register()` deduplicated per process),
  `src/transpilers/esm/loader-utils.mjs` (the resolve hook applies the version query to every result; the load
  hook judges extensions without the query; `clearResolutionCaches` registered as a reload listener),
  `src/bindings/binding-registry.ts` (`addRegistrationListener()` replaces `setRegistrationListener()`, plus
  `clear()` and `getBindingSourceFiles()`), `src/utils/our-callsite.ts` (`rawFile`), `src/api/selective-load.ts`
  (uses the shared fingerprint and the new listener API), `src/utils/tsflow-timing.ts` (`resetTimings()`),
  `src/transpilers/transpile-cache.ts` (`resetTranspileCacheStats()`), `src/cli/index.ts` (branches to the loop),
  `src/cli/argv-parser.ts` (`-w, --watch` / `--no-watch`, `watch` on `ITsflowConfiguration`), `src/api/index.ts`
  and `src/api/wrapper.mjs` (export `SupportReloader`). Docs: `README.md` ("Watch mode" section, option row),
  `Architecture.md` (execution flow, "Watch mode" subsection, ESM loader caches, CLI, API layer), `CHANGELOG.md`
  (`Added`, `Changed`, the Phase 9 entry's listener name), `CLAUDE.md` (flow), `research/local-consumer-testing.md`
  ("Watch mode on this suite").
- Logs of the UIS runs are under `research/profiles/p10-watch/` (gitignored). The scratch driver that produced them
  (spawn the CLI with `--watch`, wait for each `Run took` line, write `\n` or `q`, edit a file between runs) is
  described in `local-consumer-testing.md`; the spec in `watch-mode-test.ts` is the same idea in permanent form.

## What Phase 10 landed

- **The ESM decision.** The Phase 9 notes left two designs for ES modules, which Node's module map cannot evict:
  re-import under a cache-busting query, or a resident coordinator that forks a child per run. The second was
  not built. It saves only the coordinator's own bootstrap, configuration and parse; the child would still load
  the set-up modules that Phase 9 measured as the floor (about 2.5 s of jsdom, jest, Vue and PrimeVue on a
  one-scenario UIS run), and removing that floor is the whole case for a watch mode. The query design keeps
  them. Its costs are the ones the notes predicted and are documented in the README: the previous instance of a
  re-evaluated module stays in the map unreachable (a leak of one small module per rerun per file), stack traces
  show `x.ts?tsflow=3`, and a class re-evaluated in one run is not `instanceof`-compatible with an instance a
  module-level singleton kept from the previous one. Reported step locations are unaffected: `fileURLToPath`
  drops the query, the load hook maps the module under its full URL, and `Callsite` finds the map.
- **What evaluates again.** `SupportReloader.prepare()` builds one set per rerun: every support file that
  registered anything last time (the CucumberJS builder is reset per load, so a file's decorators must fire again
  for the new library to contain its definitions; a file that registered nothing, such as the jsdom set-up, is
  kept), every file whose record is missing (new, or forgotten after a failed load), the changed files and the
  reverse closure of project modules that import or require them (over the recorded ESM edges and
  `require.cache` children), and every module that applied decorators without being a support file. That last
  set is read from the registry's callsites both after each load and at the start of the next `prepare()`,
  because a module can register during the run (the reload-support spec's fixture is required by a scenario, and
  the first cut missed it). "Registered anything" is the builder fingerprint (steps included) or a registration
  seen through the registry listener, so a file whose only patterns are tag-scoped duplicates (which
  `addStepBinding` does not re-register with CucumberJS) still counts. The set is evicted from `require.cache`,
  versioned for ESM, the `BindingRegistry` is cleared, and the ESM resolution caches are dropped.
- **Why the reverse closure is versioned as a whole.** A kept parent is never re-resolved, so if only the edited
  child were versioned the parent would keep the old instance; every module between an entry and an edited
  module gets the new version, and the resolve hook applies versions to every URL it returns, its own and
  `nextResolve`'s, so an unversioned importer of a versioned module still gets the new instance the moment it is
  itself re-evaluated. `bumpModuleVersions()` also forgets a module's recorded outgoing edges so an import the
  file no longer has does not linger in its graph (which selective loading reads).
- **The fallback.** Under `module.register()` (ts-node ESM, ts-vue ESM, third-party loaders,
  `TSFLOW_ESM_HOOKS=async`) the hooks run on another thread that sees neither the import graph nor the versions,
  so `SupportReloader.unsupportedReason()` names the loader and the loop spawns `cucumber-tsflow` with the same
  arguments plus `--no-watch` per run, watching only the feature and support files. `--no-watch` exists for this
  and to override a profile's `watch: true`.
- **The loop.** `src/cli/watch.ts`: banner, raw-mode stdin on a TTY (Enter reruns, `q` or Ctrl-C quits; a piped
  stdin works the same, which is how the spec and the measurements drive it), one non-recursive `fs.watch` per
  directory that holds a known file (features, support files, every project module `module-graph.ts` knows),
  refreshed after every run, 200 ms debounce, one queued rerun while a run is in progress. An event counts when
  it names a known file or a new file with a feature or code extension; an event with no filename re-evaluates
  everything. Each in-process run resets the timing store and the transpile-cache counters (so `TSFLOW_TIMING`
  reports one run) and passes a shallow copy of the run configuration, because `runCucumber` replaces
  `options.support` with the loaded library. The exit code is the last run's; `--exit` is ignored while watching.
  Report files are rewritten per run as usual. Parallel mode works unchanged (children are forked per run and
  load fresh); the resident saving is the coordinator's.
- **Found on the way.** `registerLoader()` called `module.register()` on every `getSupportCodeLibrary()` call, so a
  second load in one process stacked another copy of the loader on the hooks thread (the in-thread path was
  already deduplicated); fixed for every caller. A load failure left the progress spinner worker alive; the
  catch now calls `progress.finish()`.

## Verified on the spec workspaces

All runs on the built `lib/`, driven through piped stdin; "first run" includes the process bootstrap.

| Workspace / profile | First run | Reruns | What was checked |
| --- | --- | --- | --- |
| `node-esm` / `esnodeesm` (ESM, esbuild in-thread) | 10.7 s | 66–135 ms | Enter; touch of `basic-test.ts`; an assertion flipped in it fails run 4 (`1 failed`, stack shows `basic-test.ts?tsflow=3`, reported location `basic-test.ts:97`), restored passes run 5; `(rerun N: 7 evaluated again, 0 kept loaded)` |
| `node` / `esnode` (CJS, esbuild) | 462 ms | 73–134 ms | same cycle; `1 other module` is `fixtures/reload-fixture.ts`, which the reload-support scenarios require at run time |
| `node-esm` / `tsnodeesm` (ts-node ESM, `module.register()`) | 4.5 s | 3.7–4.0 s | fallback: `Support code cannot be kept loaded between runs (…); each run starts a fresh process`, one bootstrap notice per run |
| `vue-esm` / `esvue-esm` (Vue ESM, jsdom) | 34.8 s | 205–271 ms | `(rerun 1: 8 evaluated again, 1 kept loaded)`: the kept file is `vue-jsdom-setup.mjs`; touching `fixtures/scenario-context.ts` gives `1 other module` and its four importers re-evaluate; `9 of 9 transpiles from the cache`, so the `.vue` components stayed loaded |
| `node` / `esnode`, `watch-mode-test.feature` | 1.8 s for the scenario | — | the spec: three runs on the `watch` profile, `3 scenarios (3 passed)` each, `(rerun N: 2 evaluated again, 0 kept loaded)`, exit code 0 |

## Measured effect on the large suite

UIS Tools VueApp, `es-vue-esm`, experimental decorators, serial, `TSFLOW_TIMING=true`, same build, `selectiveLoad`
off (the profile does not set it). Logs under `research/profiles/p10-watch/`.

One scenario (`-p default --name "Loading indicator displays while reviews are loading"`, three steps), `--watch`,
Enter twice:

| Run | `gherkin` | `support:import` | `esm:load` (files) | `esm:resolve` (calls) | `transpile-cache:hit` | `runtime:run` | Wall clock of the run |
| --- | --- | --- | --- | --- | --- | --- | --- |
| first (fresh process, disturbed) | 2424 ms | 194.7 s | 93.4 s (2564) | 7.3 s (9407) | 24.1 s (968) | 265 ms | 3 m 20 s |
| rerun 1 (`211 evaluated again, 5 kept loaded`) | 130 ms | 731 ms | 114 ms (211) | 252 ms (1597) | 59 ms (211) | 82 ms | 1.1 s |
| rerun 2 | 142 ms | 738 ms | 113 ms (211) | 260 ms (1597) | 58 ms (211) | 81 ms | 1.1 s |

The first run is one of the disturbed runs the Phase 8 and 9 notes describe (`esm:load` at 36 ms per file
against about 1 ms warm) and is excluded; the fresh-process reference for the same filter is Phase 9's
`support:import` 4.5–4.7 s with a whole startup of about 5.4 s, and two fresh one-shot runs taken later in this
session: one disturbed again (`bootstrap` 26.6 s, `support:import` 169.8 s) and one clean — `bootstrap` 449 ms,
`gherkin` 173 ms, `support:import` 5.96 s (`esm:load` 1.11 s over 2564 files, `esm:resolve` 2.31 s over 9407
calls), `runtime:run` 352 ms, **7.8 s from process start to exit**. Read the reruns as: **a one-scenario rerun
costs 1.1 s wall clock, of which 0.73 s is evaluating the 211 support files that registered something (2132 step
definitions re-registered) and 0.13 s parsing the 212 feature files**, against 7.8 s for a fresh process. The
968-module graph is not loaded again: `esm:load` ran 211 times (the support files themselves), so every helper,
component, `@uis/testing-bdd`, jsdom and Vue module was served from the module map. The 5 kept files registered
nothing.

With `--selective-load` as well (same filter, `--watch`, Enter twice; `selectiveLoad` and watch mode compose,
each deciding independently what to load):

| Run | Support files loaded | `selective-load:plan` | `support:import` | `esm:load` (files) | `formatters:init` | `runtime:run` | Wall clock of the run |
| --- | --- | --- | --- | --- | --- | --- | --- |
| first (fresh process) | 17 of 216 | 89 ms | 4.18 s | 629 ms (1142) | 19 ms | 265 ms | 5.5 s |
| rerun 1 | 17 of 216 (`211 evaluated again, 5 kept loaded`) | 57 ms | 74 ms | 14 ms (12) | 338 ms | 101 ms | 0.87 s |
| rerun 2 | 17 of 216 | 64 ms | 185 ms | 13 ms (12) | 191 ms | 86 ms | 0.78 s |

The rerun evaluates the 12 loaded files that registered something (the other 5 of the 17 are kept) and the whole
support phase is 0.07–0.19 s; what remains of the 0.8 s is parsing the features (0.17–0.19 s), the formatters
(0.2–0.3 s on a rerun, against 19 ms on the first run — not investigated; the `html` formatter re-opening its
output is the likely candidate), the run itself and the timing report. **This is the inner loop the phase was
for: one scenario of a 1582-scenario suite reruns in under a second, from 7.8 s.**

**The full suite (`-p default`, 1582 scenarios), `--watch`, Enter once — the rerun ran out of memory.** The first
run was clean: `gherkin` 165 ms, `support:import` 5.13 s (`esm:load` 1.41 s over 2570 files, `esm:resolve`
1.87 s over 9631), 1582 passed, `runtime:run` 234 s, 4 m 1 s wall clock. The rerun parsed the features in 2.5 s,
evaluated the 211 support files in 10.0 s, ran `BeforeAll` in 6.8 s (all several times their first-run cost) and
died about 80 scenarios in with `FATAL ERROR: Ineffective mark-compacts near heap limit … JavaScript heap out of
memory` at a 4.06 GB heap. The first run's memory was still live. Two follow-ups located it:

| Profile, `--watch`, Enter | Heap after run 1 | after run 2 | after run 3 | after run 4 |
| --- | --- | --- | --- | --- |
| `utils` (71 scenarios, no components), `--expose-gc`, heap after a full GC | 59 MB | 59 MB | 60 MB | 61 MB |
| `dim` (334 component scenarios), heap as it stands | 1.4 GB | 2.5 GB | 3.5 GB | — |
| `dim`, `--expose-gc`, heap after a full GC | 1.2 GB | 2.3 GB | — | — |

So the resident machinery itself retains nothing measurable (`utils` is flat to within 2 MB over four runs), and a
`dim` run leaves about 1.1 GB of *live* objects behind — about 3.3 MB per scenario — that a fresh process would
discard at exit and a resident one keeps, because the modules that hold them (the jsdom `document`, the
`@uis/testing-bdd` shim, stores) are exactly the ones watch mode keeps. That is the suite's state (components
mounted and never unmounted, mocks never reset), not tsflow's, and the same growth happens inside a single fresh
run; watch mode makes it cumulative. The status line now prints the heap after each run (after `gc()` when Node
exposes it) so the growth is visible, and the README says what to do about it: clean up per scenario in an
`@after` hook, raise `--max-old-space-size`, or keep watch mode for the filtered inner loop it is for. On a
one-scenario filter the same suite is flat (the reruns above) and the payoff is intact. The `dim` reruns' loads
(150 ms and 430 ms for 33 files, against 18 ms for 5 on `utils`) and the full rerun's 10 s show the other cost of
a bloated heap: everything, including module evaluation, slows as V8 spends its time in mark-compact.

## Re-rating after Phase 10

| #   | Change | I/C after Phase 9 | I/C now | Why |
| --- | --- | --- | --- | --- |
| 23  | `reloadSupport()` as a CLI watch mode | 7 / 6 | done | Landed as `--watch`. A one-scenario rerun on the UIS suite is 1.1 s (0.8 s with `selectiveLoad`) against 7.8 s for a fresh process; on the spec workspaces 70–270 ms against 0.5–35 s. Not for whole-suite reruns on a suite that leaves state behind: the heap grows by what each run retains. |
| 25  | esbuild `build()` bundling | 5 / 10 | 4 / 10 | The inner loop no longer pays the module graph at all; 25's remaining case is the fresh-process full run (CI, the first run of a session), where the 968-module load is 5.8 s warm on this suite. |

## Notes specific to Phase 11

- Phase 11 is item 25, the bundling prototype, and it is the last item. Its case has narrowed twice: Phase 9
  removed most of the module graph from a filtered fresh run, and Phase 10 removes it from every rerun. What is
  left is the fresh-process full run: on the UIS suite 5.8 s of `support:import` for 216 files and 968 modules
  (this session's undisturbed first full run), of which Phase 7 attributed most to Node's module loader rather
  than to transpiling. Measure that number first on the day, with `TSFLOW_TIMING`, before deciding whether a
  prototype is worth building; the bar is CI wall clock, since a developer's inner loop is now served by watch
  mode and selective loading.
- Bundling changes module identity: one bundle per support file (or one for all) means `require.cache` and the
  ESM module map hold bundle URLs, not source files, so both the selective-load index (which records project
  modules by path and stamps them) and watch mode (which evicts and versions by path) would need the bundle's
  `metafile` to map back to sources. Prototype with those two features off, and treat making them compose as part
  of the item's complexity, not an afterthought.
- Watch-mode behavior to keep in mind when touching loading: `getSupportCodeLibrary` is now called more than
  once per process by design, so anything registered there must be idempotent or deduplicated (the
  `module.register()` fix in this phase is the example); `BindingRegistry.clear()` runs before every rerun; the
  `SupportReloader` decides from the *previous* run's observations, so a change to what "registered something"
  means must be reflected in `endFile()`.
- Watch mode's memory behavior is the suite's, not tsflow's (`utils` flat at 60 MB over four runs; `dim` +1.1 GB
  live per run). If a future phase wants to help such suites, the candidates are a documented per-run reset hook
  (`AfterAll` is the consumer's tool already) or a `--watch` option to re-evaluate the set-up modules too, at the
  cost of the floor Phase 9 measured; neither was started. A cheap diagnostic that was not built: a heap snapshot
  after a run (`v8.writeHeapSnapshot()`) behind an environment variable, to name the retaining module.
- When measuring on this machine, the first run of a session is frequently disturbed (three of this session's
  first runs were; the fourth, the full suite, was not). The rerun numbers are far more stable than any first run.
- Build with `yarn build`, never bare `tsc`; run `yarn test:all` before calling the phase done.
