# Decisions

Part of the [Performance Enhancement Execution Strategy](performance-enhancement-execution-strategy.md).

The durable design decisions of the speed-enhancement work, condensed to one section each and in the order they
were taken: the problem, the decision, the evidence, the consequences, and the hand-off that took it, which has
the full record. Numbers are warm runs on UIS Tools, the reference suite described in the [README](README.md),
unless a section says otherwise. Item numbers are the worklist's, rated in [ratings.md](plan/ratings.md).

| Decision | Taken in |
| --- | --- |
| [Capture callsites lazily](#capture-callsites-lazily) | Phase 4 |
| [Keep jsdom from turning source-map lookups into requests](#keep-jsdom-from-turning-source-map-lookups-into-requests) | Phase 4 |
| [Run the esbuild ESM loaders in-thread](#run-the-esbuild-esm-loaders-in-thread) | Phase 5 |
| [Call esbuild directly from the ESM loaders](#call-esbuild-directly-from-the-esm-loaders) | Phase 5 |
| [No runtime phase](#no-runtime-phase) | Phase 7 |
| [Cache transpile output on disk, keyed on everything that shapes it](#cache-transpile-output-on-disk-keyed-on-everything-that-shapes-it) | Phase 8, 12c |
| [Remove the `parallelLoad` preload, keep the option](#remove-the-parallelload-preload-keep-the-option) | Phase 8, 12c |
| [Parse the features before loading support code](#parse-the-features-before-loading-support-code) | Phase 9 |
| [Selective loading, off by default](#selective-loading-off-by-default) | Phase 9 |
| [Watch mode: a resident process, ES modules re-imported under a version query](#watch-mode-a-resident-process-es-modules-re-imported-under-a-version-query) | Phase 10 |
| [Close bundling without a prototype](#close-bundling-without-a-prototype) | Phase 11 |
| [`node:test` rather than vitest](#nodetest-rather-than-vitest) | Phase 12, 12a |
| [One rule for which caches reset on reload](#one-rule-for-which-caches-reset-on-reload) | 12c, 12e |
| [Node's compile cache: removed before release](#nodes-compile-cache-removed-before-release) | Phase 4, 12c, release review |
| [cucumber-tsflow's own output on stderr](#cucumber-tsflows-own-output-on-stderr) | Release review |
| [Release as 8.0.0, a major version](#release-as-800-a-major-version) | Release review |

## Capture callsites lazily

**Problem.** Every step and hook decorator worked out its source position while its support file loaded: a stack
capture and a `source-map-support` translation per decorator, on the critical path of every startup.

**Decision.** `Callsite.capture()` stores only the raw V8 frame, taken with `Error.stackTraceLimit` lowered to the
three frames it needs and `Error.prepareStackTrace` swapped and restored around one `new Error()`. `filename` and
`lineNumber` are getters that map the frame on first read and memoize. The registry keys step bindings on the raw
position (`stepBindingKey`), so registering a step resolves nothing.

**Evidence.** Microbenchmark on plain Node with a 30-deep stack: capture 21.5 µs before, 6.0 µs after, plus
6.1 µs per binding for the deferred resolve. The first resolution now runs in `updateSupportCodeLibrary`, after
all support code has loaded, which is what made the next decision's 20 s visible.

**Consequences.** The working-directory stripping uses `path.sep`, so Linux and macOS report `uri`s relative to the
working directory as Windows already did; that was the one behavior change.

**Taken in:** [Phase 4 hand-off](hand-offs/phase-04-hand-off.md#what-phase-4-landed), item 8.

## Keep jsdom from turning source-map lookups into requests

**Problem.** `source-map-support` treats a process with `window` and `XMLHttpRequest` globals as a browser, and
every jsdom set-up creates both, tsflow's own `vue-jsdom-setup.mjs` included. It then issued a synchronous
`XMLHttpRequest` for each source file before falling back to `fs`, and jsdom services a synchronous request by
spawning a process: 680 ms per file with the globals present, 0.3 ms without. CommonJS suites never paid it,
because ts-node redirects `source-map-support` to its own copy installed with `environment: 'node'`.

**Decision.** `withoutBrowserDetection()` in `utils/our-callsite.ts` removes the `XMLHttpRequest` global for the
duration of each synchronous `wrapCallSite` call, when both globals are present and the property is configurable,
and restores it in `finally`. Calling `sourceMapSupport.install({ environment: 'node' })` instead was rejected:
`install()` also sets `Error.prepareStackTrace` and a one-shot flag that would silence a consumer's own later
`install()`.

**Evidence.** On the `dim` profile (34 step files) startup went from 24–29 s to 3.8–4.6 s and the wall clock from
77 s to 56–58 s. With resolution deferred but no fix, the same 20 s left `support:import` and reappeared, to the
millisecond, in `registry:update`, which proved the attribution.

**Consequences.** Every jsdom suite on the ESM transpilers had paid about 0.7 s per support file on every run since
decorators first captured callsites. The fix mutates no library state and behaves the same for a suite whose
support files carry source maps.

**Taken in:** [Phase 4 hand-off](hand-offs/phase-04-hand-off.md#what-phase-4-landed); explained from first
principles in [phase-4-callsite-resolution-and-jsdom.md](analysis/phase-4-callsite-resolution-and-jsdom.md).

## Run the esbuild ESM loaders in-thread

**Problem.** Under `module.register()` the loader hooks run on their own thread, so every `resolve` and every
`load` of every module the thread imports, dependencies included, costs a `postMessage` round trip and a
structured clone of the result. Item 18 wanted an asynchronous `esbuild.transform()` and item 21 synchronous
hooks; the two could not both be had.

**Decision.** Synchronous in-thread hooks. `registerLoader()` in `api/register-loaders.ts` is the one place a
loader is attached: tsflow's own `esnode-loader` and `esvue-loader` go to `module.registerHooks()` on Node 22.15,
23.5 and later, once per thread because hooks stack; the ts-node loaders, third-party loaders, older Node and
`TSFLOW_ESM_HOOKS=async` go through `module.register()` as before. The asynchronous half of item 18 was dropped,
since in-thread hooks must be synchronous. No `engines` change was needed, because the fallback covers older Node.

**Evidence.** A same-build A/B on `dim`: `support:import` 2.9–3.1 s in-thread against 3.2–3.4 s on the hooks
thread, about 0.3 s or 10% of the warm startup, which matches some 4.2 k hook calls at about 70 µs of thread hop
each. The hooks' own execution barely moved.

**Consequences.** In-thread hooks also see `require()`, so `isRequire(context)` hands those straight to Node, and
`registerHooks` is thread-local, so every thread registers its own. The loaders never call `nextLoad` for `.ts`,
`.vue` and `.json` sources, so a consumer loader listed after tsflow's cannot transform the raw source first.
Selective loading and in-place watch reruns need the in-thread hooks: under `module.register()` the first turns
itself off with a note and the second starts a fresh process per run.

**Taken in:** [Phase 5 hand-off](hand-offs/phase-05-hand-off.md#what-phase-5-landed), items 18 and 21.

## Call esbuild directly from the ESM loaders

**Problem.** The esbuild ESM loaders still ran through ts-node: `tsnode-service.mjs` required `ts-node-maintained`
and created a ts-node service when the loader initialized, before any TypeScript file loaded, and the output and
its source map went through ts-node's parse, stringify and base64 cycle.

**Decision.** `loadTypeScript()` reads the file and calls esbuild's `transpileCode()` with an inline source map;
ts-node is gone from the esbuild loaders. `tsnode-service.mjs` was deleted, and on the owner's decision so were
`esbuild-transpiler.mjs`, its bundled CommonJS copy, its build script and its `exports` entry, since no tsflow
loader used the ts-node `Transpiler` plugin any more.

**Evidence.** Loader initialization (`esm:hooks-init`) became the `import()` of the loader module, 91 ms on the
`node-esm` spec workspace, where Phase 3 measured 128–141 ms for creating the ts-node service. The rest of the
saving is inside the Phase 4 to Phase 5 startup drop on `dim` (3.7–4.6 s to 2.9–3.1 s), which the hand-off
shares between this change, the in-thread hooks and session-to-session variance without splitting it.

**Consequences.** `./lib/transpilers/esm/esbuild-transpiler` is the one published path the branch removes from the
`exports` map, documented with its replacement. Explicit `.ts` and `.tsx` specifiers fall through to Node's
resolver, and `yarn build` no longer has a bundling step.

**Taken in:** [Phase 5 hand-off](hand-offs/phase-05-hand-off.md#what-phase-5-landed), item 18.

## No runtime phase

**Problem.** Phase 7 was to decide whether a runtime phase existed at all: where the 37 s of `runtime:run` on the
`dim` profile go.

**Decision.** No runtime phase; the rest of the work went to startup.

**Evidence.** A CPU-profile attribution put tsflow's self time at 0.4% of `runtime:run` on both `dim` and the full
suite, stable over five runs, with its hottest function at 25–30 µs a step; CucumberJS is another 0.4–0.5%. The
runtime is jsdom (55% on `dim`, 65% on the full suite), Vue (21% and 12%) and the PrimeVue components, driven by
the suite's own DOM queries. The same session measured the full suite's warm startup at 9.1 s: 2.8 s of transpile
work and 5.5 s of Node's module loader.

**Consequences.** The one framework-side cost found, the `regexp-match-indices` polyfill inside
`@cucumber/cucumber-expressions` (1.2% of the run), is upstream and recorded as item 29. The DOM-query findings are
recorded for the suite's owners, not as work here. The startup split priced Phases 8 to 11.

**Taken in:** [Phase 7 hand-off](hand-offs/phase-07-hand-off.md#conclusions), item 27.

## Cache transpile output on disk, keyed on everything that shapes it

**Problem.** Transpiling was 2.8 s of the full suite's 9.1 s warm startup (esbuild about 1.5 s, the Vue SFC
compiler about 1.25 s), repeated on every run for sources that had not changed.

**Decision.** A content-addressed on-disk cache (`transpilers/transpile-cache.ts`) around every esbuild and Vue SFC
entry point, on by default (`transpileCache`, `--no-transpile-cache`). The key rule: everything that can change the
output is in the key, and nothing is keyed on path or modification time alone. The key is a SHA-256 over the entry
format version, the tsflow version, the caller's kind, its serialized configuration (the full esbuild options,
hence the decorator mode and the source-map setting, and the esbuild version; for ESM the tsconfig
`absoluteBaseUrl` and `paths` that are baked into the output; for Vue the style flag, output format, decorator mode
and the consumer's `vue` version), the absolute file name and the source text. Entries are written to a temporary
file and renamed into place, and any failure is swallowed, so the cache can change whether a transpile runs, never
what it returns.

**Evidence.** A same-build A/B on the full suite (974 files): `esm:load` 3.05–3.34 s off against 0.93–1.11 s warm,
`support:import` 6.7–7.2 s against 5.1–5.5 s. On `dim`, 0.6–0.7 s of a 2.9–3.0 s startup, about 22%. A cold run
pays about 3.5 ms per entry written, once per source change.

**Consequences.** Entries are deliberately not portable across checkout paths, because the path mappings in the
output are absolute. ts-node's own TypeScript output is not cached. The store is pruned to 512 MB, oldest written
first, and only by a run that wrote entries. Stage 12c kept the rule while consolidating: the CommonJS and ESM
esbuild paths share one kind with the output format in the key, the ESM Vue entry caches the compiled component
together with its import-rewriting pass and carries the path mappings in its key, and the decorator mode reaches
every transpiler as one value.

**Taken in:** [Phase 8 hand-off](hand-offs/phase-08-hand-off.md#what-phase-8-landed), item 16; the 12c changes
in [stage-12c-hand-off.md](hand-offs/stage-12c-hand-off.md#what-group-4-landed).

## Remove the `parallelLoad` preload, keep the option

**Problem.** `parallelLoad` loaded the support code in worker threads before the main thread loaded it again.
Phase 8 let the preload threads fill the transpile cache the main thread reads, the only thing they could leave
behind; the question was whether that paid for the threads.

**Decision.** The owner chose removal: the preload (`loader-worker.ts` with its 160-line `window` shim,
`parallel-loader.ts` and the descriptor transfer between them) is deleted and the transpile cache stays. The branch
was then planned as a minor release, so `parallelLoad` remains in every public type as a `@deprecated` field and
`--parallel-load` still parses as a hidden option; a truthy value prints a deprecation notice that names where to
remove it. When the release became 8.0.0 the option was kept that way, so a leftover setting prints the notice
rather than failing, and its removal waits for a later major.

**Evidence.** A same-build A/B on `dim`: startup 9.6–9.7 s cold and 8.7–10.0 s warm with the preload, against
5.6 s and 3.6–3.8 s without. The preload cost 5.1–6.0 s on every run and could save at most 1.8 s, cold only. The
cost was module evaluation: even on a warm cache each worker spent 4.4–4.9 s evaluating a module graph that the
main thread then evaluated again.

**Consequences.** Items 15 and 17 lost their subject and were dropped. The rule for the release came from the same
case and was confirmed by the owner in 12c: a minor release must not remove or break anything a user could rely on;
it deprecates and says so, and removal waits for a major. The release review replaced it (see
[Release as 8.0.0](#release-as-800-a-major-version)).

**Taken in:** [Phase 8 hand-off](hand-offs/phase-08-hand-off.md#parallelload-removal-2026-09-17), after
[the A/B](hand-offs/phase-08-hand-off.md#parallelload-ab-on-dim-2026-09-17-after-phase-8); the minor-release rule
in [stage-12c-hand-off.md](hand-offs/stage-12c-hand-off.md#what-group-2-landed).

## Parse the features before loading support code

**Problem.** CucumberJS loads every support file before it parses the features, so nothing about the selected
scenarios is known while support code loads, and a filtered run cannot load less.

**Decision.** `runCucumber` parses and filters the pickles right after resolving paths, before any support file
loads. The formatters do not exist yet, so the Gherkin envelopes are buffered and emitted once they do, in the
previous order (`meta`, the Gherkin messages, then the support-code messages). The "exit early when nothing
matches" half of item 19 was left out on purpose: a zero-scenario run still initializes the formatters, writes
report files and runs `BeforeAll` and `AfterAll`, and changing that is a behavior change with no performance case.

**Evidence.** No saving was claimed for it alone; it landed as the precondition for selective loading, below.

**Consequences.** Startup runs resolve, parse, load and launch, in that order. A parse error still loads the support
code and initializes the formatters before the errors are logged, as before.

**Taken in:** [Phase 9 hand-off](hand-offs/phase-09-hand-off.md#what-phase-9-landed), item 19.

## Selective loading, off by default

**Problem.** A filtered run, a developer's inner loop on one scenario, loaded every support file and its module
graph: 216 support files and 968 modules on the UIS `default` profile for one scenario.

**Decision.** `selectiveLoad` records, per support file, the step patterns it registered and its whole project
import graph (each module stamped with modification time and size), then loads only the files whose patterns match
the selected steps, plus every file that registered anything but step definitions, every new file and every file
whose graph changed. A step that matches nothing loads everything, so an undefined step is reported as a full run
would report it. The option is off by default, not for its cost but because it rests on one assumption the tool
cannot check: that a support file which only defines step definitions has no other effect on the run, such as
patching a global or registering a Vue plugin as a side effect of being imported.

**Evidence.** A one-scenario run loaded 17 of 216 files and 285 of 968 modules; `support:import` fell from 4.5–4.7 s
to 2.7–3.1 s and the whole startup from about 5.4 s to 3.7 s, with the plan costing 75–90 ms and the index rewrite
20–30 ms. A full run with the option on pays about 0.4 s. What remains, about 2.5 s, is the set-up that always
loads (jsdom, jest, Vue), which only a resident process can take out of the inner loop.

**Consequences.** Loaders attached with `module.register()` run where the import graph cannot be recorded, so there
the option turns itself off with a note on the progress line. The index lives beside the transpile cache, under
`node_modules/.cache/cucumber-tsflow/selective-load/`. The 2.5 s floor became the case for watch mode. The
assumption is stated for users in [docs/performance-and-diagnostics.md](../../docs/performance-and-diagnostics.md).

**Taken in:** [Phase 9 hand-off](hand-offs/phase-09-hand-off.md#measured-effect-on-the-large-suite), item 24.

## Watch mode: a resident process, ES modules re-imported under a version query

**Problem.** A fresh process always loads the 2.5 s of set-up modules that never change between edits, and Node
cannot evict an ES module from its module map, so a watch mode needed another way to evaluate an edited module
again.

**Decision.** `--watch` keeps one process alive and reruns on Enter or on a file change, keeping every module
loaded except what must evaluate again: the support files that registered something, the changed files and the
project modules that import them, and helpers that apply decorators. CommonJS modules are evicted from
`require.cache`; ES modules are re-imported under a `?tsflow=<n>` query that the in-thread resolve hook applies. A
resident coordinator forking a child per run was rejected: it saves only the coordinator's bootstrap,
configuration and parse, while the child would still load the set-up whose removal is the whole case for a watch
mode.

**Evidence.** A one-scenario rerun on the full UIS suite takes 1.1 s of wall clock (0.73 s of it re-evaluating the
211 support files that registered something) against 7.8 s for a fresh process, and 0.78–0.87 s with selective
loading as well. The 12c closing measurement repeated it: `support:import` on a `dim` rerun was 405 ms.

**Consequences.** Each rerun leaves the previous instance of a re-evaluated ES module unreachable in the module map,
stack traces show `x.ts?tsflow=3`, and a class re-evaluated in one run is not `instanceof`-compatible with an
instance a module-level singleton kept from an earlier run. The suite's own retained state grows with every run:
the full-suite rerun ran out of memory at Node's default heap in Phase 10 and completed with an 8 GB heap in 12c,
with 17 failures caused by that state, so watch mode is for the filtered inner loop. Under `module.register()`
loaders every run is a fresh process. Support code now loads more than once in one process, so everything
registered or cached on the load path has to tolerate that.

**Taken in:** [Phase 10 hand-off](hand-offs/phase-10-hand-off.md#what-phase-10-landed), item 23.

## Close bundling without a prototype

**Problem.** Item 25, bundling the support code with esbuild `build()` instead of transforming it file by file, was
the most complex item on the worklist. After Phases 9 and 10 its only remaining case was a fresh-process full run.

**Decision.** The owner closed it without a prototype: "if this saves five seconds of five minutes, the juice is not
worth the squeeze". A measured ceiling, a throwaway bundle of the 216 support files, was offered and declined,
since it is already the first third of the prototype.

**Evidence.** Of the 2564 ES modules the UIS suite loads, 1596 are dependencies that a bundle would leave external,
and jsdom (about 500 CommonJS modules) is loaded by `require()` outside the hooks. Removing every cost of the 968
project modules is bounded by about half of the 5.96 s `support:import`, so the realistic net is 1 to 3 s per fresh
run, about 1% of the four-minute full run. In the inner loop it is nothing: a watch rerun does not load the module
graph, and selective loading skips 683 of the 968 modules on a one-scenario run.

**Consequences.** The feasibility findings for a future attempt are recorded, ordered by cost, in the hand-off.

**Taken in:** [Phase 11 hand-off](hand-offs/phase-11-hand-off.md#the-ceiling), item 25.

## `node:test` rather than vitest

**Problem.** Phase 12 needed unit tests for the subsystems the branch added (the transpile cache, selective loading,
the module graph, watch mode, startup progress, timing), and the repository had no unit-test runner, only `chai` in
the spec workspaces.

**Decision.** Node's built-in runner (`node --test`) with `chai` for assertions, the tests importing the built
`lib/`. vitest was considered and declined: the owner's team does not use it, and built-ins are preferred when they
do what is needed.

**Evidence.** No new dependency: Node 24 runs `.ts` test files directly through type stripping and handles the
`.mjs` twins natively, and `chai` was already in the tree. Stage 12a landed 218 tests in 16 files that run in about
1.6 s; the release tree has 262.

**Consequences.** `yarn build` comes before `yarn test:unit`, as for every other test script, and CI runs the unit
tests after the build. Stage 12a added small seams to the modules under test (an injectable clock, index directory
and worker factory, for example) so they can be tested without the CLI.

**Taken in:** [phase-12-plan.md](plan/phase-12-plan.md#decisions-taken-with-the-owner), with the owner at the start
of Phase 12; built in the [Stage 12a hand-off](hand-offs/stage-12a-hand-off.md).

## One rule for which caches reset on reload

**Problem.** Review finding G: the branch had grown caches with no shared policy and no written rule for which of
them take part in the reset when support code loads again in the same process (a watch rerun, `reloadSupport()`).

**Decision.** Write the rule down rather than unify the caches. A cache is reset on reload when its key is a path or
specifier whose meaning depends on the project's files; it is kept when its key determines its value; and it is
kept on purpose when it holds configuration read at startup. Every module-level cache in `src`, twenty of them, is
listed under one of the three with its reason, and a new cache is judged by the same rule.

**Evidence.** The first defect of this kind found after the rule was written fits it exactly:
`@cspotcode/source-map-support` keeps every parsed source map on `globalThis`, keyed by the file's URL, so a watch
rerun of a changed CommonJS support file reported the previous version's lines. The fix forgets the store's
entries for each evicted module, and the rule's reset list gained the entry.

**Consequences.** The rule and the lists live in
[Architecture.md](../../Architecture.md#caches-and-the-reload-reset), where a new cache is added to one of them.

**Taken in:** triaged in [12c](plan/phase-12-plan.md#12c-triage) and written up in the
[Stage 12e hand-off](hand-offs/stage-12e-hand-off.md#architecturemd-and-the-changelog-as-one-product).

## Node's compile cache: removed before release

**Problem.** Phase 4 (item 14) made `bin/cucumber-tsflow.js` call `module.enableCompileCache()` and export the
directory as `NODE_COMPILE_CACHE`, so that forked children and worker threads share V8's bytecode cache. It measured
neutral, and keeping it was left as a review decision (finding P).

**Decision.** Removed in the release review (2026-09-25), before 8.0.0 shipped, because the 12c closing
measurement found it neutral and never faster, and a feature that does nothing measurable is noise: it also set an
environment variable that every child process a test spawns would inherit. No published version carried it.

**Evidence.** Phase 4 on `dim`: `bootstrap` 397–438 ms with the cache against 397–402 ms without, wall clock
identical within noise. The 12c closing measurement took three clean, interleaved pairs on the UIS suite: with the
cache off, `bootstrap` was 40 to 70 ms quicker in all three and no row was slower. The hand-off's reading: the
library, jsdom and Vue already arrive warm in the OS file cache, so the compilation saved is cheap, while every
module costs one more file open to look up its entry (18719 entries, 100 MB, on the measuring machine).

**Consequences.** The CLI no longer changes Node's compile-cache behavior; a consumer who wants the cache can still
turn it on with Node's own `NODE_COMPILE_CACHE`.

**Taken in:** measured in the [Phase 4 hand-off](hand-offs/phase-04-hand-off.md#measured-effect-on-the-large-suite)
and the [Stage 12c hand-off](hand-offs/stage-12c-hand-off.md#what-group-6-measured), finding P; removed in the
[release review](hand-offs/stage-12f-hand-off.md#release-review-2026-09-25).

## cucumber-tsflow's own output on stderr

**Problem.** Everything cucumber-tsflow printed itself went to stdout: `Loading configuration from ...`, the mode
banner, and on this branch the bootstrap notice, one line per startup phase and watch mode's status lines. stdout is
where CucumberJS formatters write, so a formatter writing there (`--format json` or `message` piped to another tool)
received tsflow's lines mixed into its stream, on every run and in CI.

**Decision.** All of tsflow's own output goes to stderr and stdout carries only formatter output, the convention of
CucumberJS and most CLIs. `StartupProgress` is given the environment's stderr, so its spinner worker draws on fd 2;
`loadConfiguration` and `runCucumber` build their `Console` on stderr; the bin and watch mode write to stderr.

**Evidence.** A review finding, not a measurement: the branch had grown the stdout output from two lines to about
eight per run, and `TSFLOW_THEME=off` was the only way to silence it.

**Consequences.** A breaking change for anyone who read those lines from stdout, listed in the 8.0.0 upgrade notes.
Colors still follow ansis's detection, which reads stdout, so a console or a CI log (both streams the same kind)
looks as before; only a lone `2> file` redirect with stdout on a terminal keeps escape sequences in that file. A
pipeline step that fails on any stderr output needs `TSFLOW_THEME=off`.

**Taken in:** the [release review](hand-offs/stage-12f-hand-off.md#release-review-2026-09-25).

## Release as 8.0.0, a major version

**Problem.** The branch was planned as 7.8.0 under the rule that a minor release removes and breaks nothing. The
release review listed what the branch already changes for a user: a throwing `BeforeAll` fails the run, step
locations become relative on Linux and macOS, steps always get the running scenario's context, `loadSupport` and
`reloadSupport` start from an empty registry, and one published export is gone. Keeping the minor-release rule
meant shims for some of these and an understatement for the rest.

**Decision.** The owner made the release 8.0.0: "this is going to completely revolutionize how cucumber-tsflow is
used ... if we are breaking a few things along the way, I think that's fine." Every breaking change is listed in the
upgrade notes of the CHANGELOG and the README, the simpler implementation is preferred over a compatibility shim,
and the maintainer confirms the number when tagging. Runtime fallbacks that exist for technical reasons (older Node,
loaders on the hooks thread, selective loading's full load) are not semver shims and stay.

**Evidence.** The main user is JHU UIS, whose teams run 7.5.5 and cross 7.6 and 7.7 when they upgrade anyway; users
who rely on the unmaintained VS Code extension can stay on 7.x.

**Consequences.** The CHANGELOG was rewritten for users with a "Breaking changes" section first, and the
engineering-level list moved to [detailed-changes.md](detailed-changes.md). Closing the `./lib/*` wildcard export,
which a major would allow, was left out: the library resolves its own transpilers through it, and re-plumbing that
right before the release was not worth the risk.

**Taken in:** the [release review](hand-offs/stage-12f-hand-off.md#release-review-2026-09-25).
