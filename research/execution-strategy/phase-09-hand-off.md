# Phase 9 hand-off

Part of the [Performance Enhancement Execution Strategy](../performance-enhancement-execution-strategy.md).

Written at the end of the Phase 9 session (2026-09-17) so that Phase 10 can start cold. Phase 9 landed item 19
(parse the features before loading support code) and item 24 (selective support loading) behind the
`selectiveLoad` option, default off.

## State of the tree

- Still on branch `2026-09-performance-enhancements`; Phase 8 ended at `e624b6f`. Phase 9 is committed as
  `5dea130` ("Parse features before loading support; selective support loading behind selectiveLoad"), which also
  carries two small leftovers from the end of the Phase 8 session (`formatDuration()` in `src/utils/helpers.ts`,
  used by the bootstrap notice in `src/cli/run.ts` so it prints `28.9s` rather than `28912 ms`). The tree was
  clean after it; Phase 10 starts from there.
- `yarn build` clean, no stray `.js` under `src/`; ESLint and Prettier clean on every touched file; `yarn test:all`
  green on all sixteen variants (see below for what the matrix now exercises).
- Files added: `src/api/selective-load.ts` (the session: index, plan, recorder) and `src/utils/module-graph.ts`
  (import-graph observation and walks). Files changed: `src/api/run-cucumber.ts` (phase order, buffering,
  planning), `src/api/support.ts` (`SupportLoadRecorder` bracketed around each file),
  `src/bindings/binding-registry.ts` (`setRegistrationListener`), `src/transpilers/esm/loader-utils.mjs` (the
  resolve hook records import edges), `src/transpilers/transpile-cache.ts` (`getCacheRootDirectory()` shared with
  the index), `src/cli/argv-parser.ts`, `src/api/load-configuration.ts`, `src/api/convert-configuration.ts`,
  `src/runtime/types.ts` (the option), `src/utils/startup-progress.ts` (phase order and the pickling theme's
  parse phase). Docs: `README.md` (option row, new "Selective loading" section, phase order under "Startup
  progress"), `Architecture.md` (execution flow, new "Selective loading" subsection, API layer), `CHANGELOG.md`
  (`Added` and `Changed`), `CLAUDE.md` (flow).
- Five spec profiles now set `selectiveLoad: true` — `node/esnode`, `node-esm/esnodeesm`, `vue-esm/esvue-esm`,
  `node-exp-esm/esnode-loader`, `vue-exp-esm/esvue-esm` — so the matrix exercises the recording and index-writing
  path on every run and, on a developer machine where the index already exists, the planning path as well (the
  tag filters select whole features, so the plan loads every file those features' steps match; on `esnodeesm`,
  where `@reload` is excluded, `reload-support-test.ts` is skipped). On CI the index is always cold.
- The index for a configuration lives at `node_modules/.cache/cucumber-tsflow/selective-load/<sha256>.json`
  next to the transpile cache; the spec workspaces' indexes are under this repository's root `node_modules`,
  the UIS ones under `Tools.Web/VueApp/test/node_modules`. Delete the directory to start cold.

## What Phase 9 landed

- **Item 19, without the early exit.** `runCucumber` runs `getPicklesAndErrors` and the `pickles:filter` /
  `pickles:order` transforms right after `resolvePaths`, before any support file loads. The formatters do not
  exist yet, so the Gherkin envelopes (`source`, `gherkinDocument`, `pickle`, `parseError`) are pushed onto an
  array and emitted after `initializeFormatters` and `emitMetaMessage`, which reproduces the previous order
  exactly (`meta`, Gherkin, then `emitSupportCodeMessages`). The parse-error path is unchanged in effect: the
  support code still loads, the formatters still initialise and clean up, and the errors are logged after the
  replay. The "exit early when nothing matches" half of item 19 was deliberately not done: a zero-scenario run
  today still initialises formatters, writes report files and runs `BeforeAll`/`AfterAll`, and changing that is
  a behaviour change with no performance case behind it. The startup progress phases run resolve → parse →
  load → launch; the pickling theme's parse phase is now `Making the brine` (the title the removed preload
  phase used to have), the LOTR theme keeps the Ents, who march on Isengard before the beacons are lit, and
  the formatters no longer have a phase (they take milliseconds).
- **Item 24: what the index records.** `SelectiveLoadSession` implements the `SupportLoadRecorder` that
  `getSupportCodeLibrary` calls before and after each `require`/`import`. Everything a support file registers
  happens synchronously between the two calls, so the session attributes to the file: every step pattern the
  `BindingRegistry` indexed meanwhile (through the new `setRegistrationListener`, which sees duplicates and
  tag-scoped alternatives that tsflow does not re-register with CucumberJS), every pattern that appeared on
  the CucumberJS builder's `stepDefinitionConfigs` (steps registered without a decorator), and a
  before/after fingerprint of the builder (hook config counts, parameter type count, `World`, `defaultTimeout`,
  `parallelCanAssign`, `definitionFunctionWrapper`). A file that changed anything but the step definitions, or
  registered no step at all, is `always` — loaded on every run. In UIS that is `test-setup.mjs`,
  `world-context.ts` and the 10 step files that also declare hooks.
- **Item 24: what the index validates against.** The file's whole project import graph, not just the file:
  a pattern can live in a helper the file imports, and a barrel that gains a re-export changes no file the
  index would otherwise see. For `require` paths the graph is `require.cache` from the entry (Node adds a cached
  module to every parent's `children`, verified on Node 24). For `import` paths there is no Node API, so the
  esbuild ESM loaders' `resolve` hook — which already sees every import site with its `parentURL`, in-thread
  under `module.registerHooks()` — calls `recordImportEdge()` with whatever it is about to return, and
  `importedProjectModules()` walks the edges. Modules under `node_modules` and inside this package are dropped
  (the library's own `lib/` would otherwise appear as project files under a pnpm `link:`). Each recorded module
  is stamped with mtime and size; any difference marks the dependent entry stale, and a stale entry is loaded.
  Attribution is by first load: a helper evaluated under entry A has its patterns recorded on A; entry B, which
  also imports it, records only B's own. That is consistent — a step in the helper loads A, which loads the
  helper — and a later selective run that loads B alone records the helper's patterns on B too, so both then
  point at it. Loaders attached with `module.register()` (ts-node ESM, third-party, `TSFLOW_ESM_HOOKS=async`)
  run on another thread where nothing is recorded, so `unsupportedReason()` turns the option off for them with
  a note on the progress line rather than silently loading everything.
- **Item 24: the plan.** After the parse, `plan(pickles)` marks every new, `always` or stale entry as must-load,
  compiles every indexed pattern with `ExpressionFactory` over a `ParameterTypeRegistry` rebuilt from the
  recorded parameter types (the built-ins plus tsflow's `boolean` plus whatever the suite defines; a pattern
  that does not compile marks its file must-load), and matches each distinct selected step text against all of
  them. Every file with a match is loaded — so an ambiguity or a tag-scoped alternative in another file is
  present exactly as in a full run — and a text with no match returns a full plan whose reason names the step,
  so an undefined step is reported as a full run would report it. The matching is the only part of the plan
  whose cost scales with the suite, and it took three passes to make it cheap on a full run (numbers below):
  each distinct pattern is compiled once and remembers every file that registered it; every pattern carries
  the literal text a match must start with (`literalPrefix()`: a Cucumber expression up to its first `{`, `(`,
  `/` — backing up to the word boundary for an alternation — or `\`; an anchored regexp up to its first
  metacharacter, minus a character before a quantifier; '' for anything doubtful) and is skipped for texts
  that do not start with it; patterns whose prefix contains a whole first word are bucketed by that word so a
  text is only compared against its bucket and the few unbucketed patterns; and the test itself is
  `regexp.test()` on the expression's compiled `RegExp`, not `Expression.match()`, which builds argument
  objects for every hit and cost four times the regex work. Matching also stops as soon as no entry is left
  to skip. `@cucumber/cucumber-expressions` is reached through
  `createRequire(require.resolve('@cucumber/cucumber'))` so it is the copy CucumberJS itself uses and no
  dependency is added. `finish(library)` rewrites the records of the loaded files (their graphs read now) and
  keeps the validated records of the skipped ones, writing atomically; `abort()` on a failed load writes nothing.
  The loaded lists go to `makeRuntime` as `resolvedSupportPaths`, so parallel children load the same subset and
  CucumberJS's positional definition ids line up (verified on the `tsnode` profile with `parallel: 1`).
- **Option plumbing.** `selectiveLoad` in `ITsflowConfiguration`, `IConfigurationExt` and
  `ITsFlowRunOptionsRuntime`; `--selective-load` / `--no-selective-load` (both declared, like the transpile cache
  flags, so commander does not inject a default over a profile); `TSFLOW_SELECTIVE_LOAD=true` as the default
  when the option is unset. `runCucumber` skips the whole thing when `options.support` is an already-loaded
  library. `loadSupport()` and `reloadSupport()` are untouched: they have no pickles to plan from.
- **Visibility.** The load-phase line reads `transpiling and loading 3 of 8 support files with es-node (5 skipped:
  not used by the selected scenarios)`, or `… 8 support files … (selective load: no index yet; this run writes
  it)`, `(selective load: "<step text>" matches no step definition in the index)`, `(selective load: every
  support file is needed by the selected scenarios)`, `(selective load unavailable: the ts-node-maintained/esm
  loader runs on Node's loader hooks thread, …)`. `TSFLOW_TIMING` gains `selective-load:plan` and
  `selective-load:index`.

## Verified on the spec workspaces

All runs on the built `lib/`, `--name "Adding two numbers"` (one scenario of `basic-test.feature`) as the filter:

| Workspace / profile | Run | Result |
| --- | --- | --- |
| `node` / `esnode` (CJS, esbuild) | cold, full | `8 support files … (selective load: no index yet; this run writes it)`, 19 scenarios passed, index written |
| `node` / `esnode` | warm, filtered | `3 of 8 support files … (5 skipped)`, 1 passed; `support:require` 108 ms against 318 ms for the same filter with the option off |
| `node-esm` / `esnodeesm` (ESM, esbuild) | cold, then warm filtered | `7 support files`, 15 passed; then `3 of 7 … (4 skipped)`, 1 passed, `support:import` 89 ms |
| `node-esm` / `esnodeesm` | `touch scenario-outline-test.ts` (skippable, unrelated) | `4 of 7`: the touched file is stale and loads; back to `3 of 7` on the next run |
| `node-esm` / `esnodeesm` | `touch fixtures/scenario-context.ts` (helper imported by four entries) | `6 of 7`: every dependent loads; back to `3 of 7` on the next run |
| `node-esm` / `esnodeesm` | a feature with a step no file defines | `8 support files … (selective load: "nothing in the suite matches this step" matches no step definition in the index)`, 1 undefined, snippet printed |
| `node-esm` / `tsnodeesm` (ts-node ESM, `module.register()`) | warm, filtered | `8 support files (selective load unavailable: the ts-node-maintained/esm loader runs on Node's loader hooks thread, where imports cannot be tracked)`, 1 passed |
| `node` / `tsnode` (CJS, `parallel: 1`) | cold, then warm filtered | `8 support files`, 19 passed; then `3 of 8 … (5 skipped)`, the child loaded the same three, 1 passed |
| `node` / `esnode` | option off; `--no-selective-load`; `TSFLOW_SELECTIVE_LOAD=true` | full load with no note; full load; `3 of 8` |

The recorded index for `node/esnode` (8 entries, 9 files): `world-context.ts`, `basic-test.ts` and `tag-test.ts`
are `always` (hooks; `world-context.ts` registers no steps), `scenario-context.ts` appears as the dependency of
the four files that import it, and no library or `node_modules` file appears.

## Measured effect on the large suite

UIS Tools VueApp, `default` profile (216 support files: `test-setup.mjs`, the jsdom set-up `require`, 214 step files;
968 modules load in full), `es-vue-esm`, experimental decorators, serial, `TSFLOW_TIMING=true`, same build, runs
in the order listed. The filter is `--name "Loading indicator displays while reviews are loading"`, one scenario of
`File-Review.feature` with three steps. Logs are under `research/profiles/p9-selective/` (gitignored).

| Run | Option | Support files loaded | Modules | `selective-load:plan` | `support:import` | `selective-load:index` |
| --- | --- | --- | --- | --- | --- | --- |
| baseline-1, baseline-2 | off | 216 | 968 | — | 168.6 s, 184.3 s | — |
| baseline-3 | off | 216 | 968 | — | 4.52 s | — |
| baseline-4 | off | 216 | 968 | — | 4.67 s | — |
| selective-1 | on, cold | 216 (`no index yet`) | 968 | 0.3 ms | 4.33 s | 238 ms |
| selective-2, selective-3 | on, warm | **17 of 216** (199 skipped) | **285** | 195 ms, 157 ms | **2.67 s, 2.84 s** | 20 ms |
| selective-4 … selective-8 | on, warm, later plan versions | 17 of 216 | 285 | 87, 90, 81, 75, 82 ms | 3.47, 3.12, 2.83, 3.10, 3.01 s | 20–30 ms |

The first two baselines are the disturbed pattern the Phase 8 notes describe (`bootstrap` 30 s on the second,
`support:import` 40× normal) and are excluded; the machine was also stalling during `dryrun-7` below. Read the
rest as: **a one-scenario run loads 17 files and 285 modules instead of 216 and 968, and `support:import` falls
from 4.5–4.7 s to 2.7–3.1 s**, with the plan costing 75–90 ms and the index rewrite 20–30 ms. The whole startup
(`bootstrap` through `formatters:init`) goes from about 5.4 s to about 3.7 s; the run itself is 0.2–0.3 s either
way.

The 17 files are the 12 that always load (`test-setup.mjs`, the jsdom set-up, `world-context.ts` and the nine
other step files with hooks) plus `file-review.ts` and four files whose patterns also match one of the three
step texts. Where the remaining 2.7–3.1 s goes, from the slowest-files table of the warm runs: `file-review.ts`
0.92–0.96 s evaluate (the first component-bearing step file pulls in Vue, PrimeVue, `@testing-library/vue` and the
component under test), `test-setup.mjs` 0.88–0.92 s (`@uis/testing-bdd/uis-jest`), `vue-jsdom-setup.mjs`
0.5–0.7 s (jsdom), then the hook files `project-entry.ts` and `conversation-compaction-mode.ts` at about 0.3 s
each. So on this suite the 199 skipped step files were worth 1.7–1.9 s, about 40% of `support:import`, and the
floor a selective run cannot go below is the always-loaded set-up plus the first real step file — about 2.5 s of
module loading that only a long-lived process (item 23) can take out of the inner loop. Item 24's original
framing, "the difference between a minute and a second", assumed the step files carried the cost; here the shared
set-up does.

Cost of the plan on a run where nothing can be skipped — `-p default --selective-load --dry-run`, 1582 pickles,
about 3500 distinct step texts against 2132 distinct patterns in 216 entries (index 333 KB, 971 stamped modules;
reading and parsing it 2 ms, stat of every module 20 ms, compiling the 2132 expressions 36 ms):

| Plan version | `selective-load:plan` | What changed |
| --- | --- | --- |
| first: `Expression.match()` of every text against every pattern | 1794 ms, 1890 ms | — |
| + one compile per distinct pattern, literal-prefix `startsWith` filter | 805 ms, 781 ms | 55,692 regex executions instead of 7.5 million, but `Expression.match()` builds argument objects for each of the 3542 hits |
| + patterns bucketed by the first word of their prefix | 732 ms, 731 ms | the scan was already cheap (about 100 ms) |
| + `regexp.test()` on the compiled expression instead of `Expression.match()` | **160 ms, 183 ms** | the argument construction was the cost |

The index rewrite after a full load is 214–279 ms (import-graph walk from 216 entries, 971 stats, one 333 KB
atomic write). So with the option on, a full run pays about 0.4 s and a one-scenario run saves about 1.8 s on
this suite; the option stays off by default for the reasons in the README (the side-effect assumption), not for
its cost.

## Re-rating after Phase 9

| #   | Change | I/C after Phase 8 | I/C now | Why |
| --- | --- | --- | --- | --- |
| 19  | Parse Gherkin ahead of support loading | 3 / 5 | done | Landed as the precondition for 24; the early exit was deliberately left out. |
| 24  | Persisted `pattern → source file` index | 6 / 9 | done | Landed and measured: 199 of 216 files and 683 of 968 modules skipped on a one-scenario run, `support:import` 4.6 s → 2.9 s. Less than its rating promised, because the always-loaded set-up (jsdom, jest, Vue) is most of what remains. |
| 23  | `reloadSupport()` as a CLI watch mode | 5 / 6 | **7 / 6** | The measurement above says the inner loop's floor is 2.5 s of set-up modules that a fresh process must always load; a resident process is the only thing that removes them. Selective loading gives a watch mode its change detection for free (a stale entry is exactly an edited file's dependents). |
| 25  | esbuild `build()` bundling | 6 / 10 | 5 / 10 | On a filtered run 24 now removes most of the module-graph cost 25 was aimed at; 25's remaining case is the full run's 968-module load. |

## Notes specific to Phase 10

- Phase 10 is item 23, the watch mode. Its case is now measured: on a filtered run the process spends about
  2.5 s loading set-up modules that never change between edits, and only a long-lived process avoids that.
- `reloadSupport()` in `src/api/load-support.ts` evicts CommonJS modules from `require.cache` and re-evaluates
  them; ES modules cannot be evicted from Node's module map, so an ESM watch mode has to either re-import under a
  cache-busting query (`file:///…?v=N`, which leaks the old instances and breaks `instanceof` across versions) or
  keep a resident coordinator and re-fork a child per run so the child pays only the support load — and with
  selective loading the child pays only the files the run needs. Measure both before choosing.
- Selective loading and a watch mode compose: the index's stale check is the change detection a watch needs, the
  `always` set is what a resident process must keep loaded, and `BindingRegistry.removeBindingsForFile()` already
  exists for the registry side of a reload. `SelectiveLoadSession` is built per `runCucumber` call and holds no
  process-wide state except the registry listener it sets and clears; the import-edge map in
  `src/utils/module-graph.ts` is process-wide and only grows, which is right for a one-shot CLI and would need
  an eviction hook in a resident process.
- When measuring startup on this machine, expect disturbed runs (three of nineteen in this session:
  `support:import` at 40× normal with `bootstrap` at 30 s, the same pattern as Phase 8's notes). Discard them by
  the `bootstrap` row rather than averaging them in.
- Build with `yarn build`, never bare `tsc`; run `yarn test:all` before calling the phase done.
