# Item ratings

Part of the [Performance Enhancement Execution Strategy](../performance-enhancement-execution-strategy.md).

The two rating scales, the summary table, the rating of every item on the worklist with its reasoning, what the ratings reveal about ordering, and the re-rating taken after Phase 5. Item numbers are those of the consolidated worklist in [performance-enhancement-analysis-2.md](../analysis/performance-enhancement-analysis-2.md), unchanged.

## Rating scales

The two axes are deliberately independent. An item can be a 9 on impact and a 2 on complexity, or a 3 on
impact and a 9 on complexity, and both readings should be legible from the numbers alone. Neither axis is
allowed to color the other: a change being easy is not evidence that it is valuable, and a change being
valuable is not evidence that it is hard.

### Impact — how much performance is recovered

This axis asks only about the magnitude of the win on a realistic large consumer suite — hundreds to
thousands of scenarios, hundreds to thousands of support files, running under one of the ESM transpiler
profiles. It says nothing about effort, risk, correctness value, or whether the change is a good idea.

- **1** — No measurable effect on wall-clock time. The change is worth making for other reasons
  (correctness, maintainability, enabling later work) but it does not make anything faster.
- **3** — A real but small saving, or a saving confined to a configuration or workflow that only some
  consumers use. Visible in a profile, not in a stopwatch.
- **5** — A clearly measurable saving on a large suite: tens to low hundreds of milliseconds, or a
  per-process constant that gets multiplied by the parallel worker count.
- **7** — Seconds off a large run, or the removal of a cost that scales with support-file count or binding
  count rather than sitting at a fixed size.
- **10** — Changes the complexity class of the dominant cost. Turns tens of seconds into effectively
  nothing.

### Complexity — how hard it is to do correctly and validate

This axis asks only about implementation effort plus the risk of getting it silently wrong. It says
nothing about how valuable the change is. The heaviest weight here is on validation difficulty, because
the recurring theme across all three analyses is that none of these costs are visible in the
twenty-eight-scenario spec matrix, so a change can pass the whole of `yarn test:all` and still be wrong on
a real suite.

- **1** — A deletion, or a single hoist inside a pure function. There is no mechanism by which behavior
  could change, and in the strongest cases the upstream analysis proved the removed work was unreachable.
- **3** — A localized edit to one or two files, correct by inspection, fully covered by the existing spec
  matrix.
- **5** — Touches several files, changes a data structure, or reorders a phase. Needs the full matrix plus
  deliberate reasoning about edge cases, ordering or platform differences.
- **7** — Introduces a new subsystem or a new cross-process contract. Needs new tests of its own, careful
  invalidation or ordering reasoning, and a plan for what happens when it is wrong.
- **10** — Changes the loading model itself. Correctness depends on module identity and decorator
  evaluation order, the failure mode is a silently incomplete run rather than a crash, and it cannot
  responsibly ship without a prototype behind a flag validated against the whole matrix.

## Summary

| #   | Change                                                               | Impact | Complexity |
| --- | -------------------------------------------------------------------- | ------ | ---------- |
| 1   | `TSFLOW_TIMING` phase instrumentation plus a slowest-files table     | 2      | 4          |
| 2   | Track the running pickle's context on `MessageCollector`             | 10     | 4          |
| 3   | Remove `files: true` and `TS_NODE_FILES` from the ESM services       | 7      | 1          |
| 4   | Memoize pattern-to-`RegExp` in `runtime/utils.ts`                    | 6      | 2          |
| 5   | `Map` lookups in `updateSupportCodeLibrary`                          | 7      | 2          |
| 6   | Precompile the tsconfig path-mapping regexes                         | 5      | 2          |
| 7   | Resolution cache on `specifier + parentURL`; thunk the ESM hooks     | 7      | 3          |
| 8   | Lazy callsite resolution, `Error.stackTraceLimit`, backslash fix     | 6      | 5          |
| 9   | Hoist tag lowercasing, step-hook filtering, definition lookups       | 5      | 2          |
| 10  | Send resolved paths to parallel children instead of re-globbing      | 4      | 4          |
| 11  | Hoist `shortUuid()`; index the `registerStepBinding` dedupe          | 3      | 3          |
| 12  | Guard hot-path `logger.checkpoint` arguments behind `isVerbose()`    | 3      | 1          |
| 13  | Delete the hardcoded `cucumber-tsflow-specs` check in `supports()`   | 1      | 1          |
| 14  | `module.enableCompileCache()` in the CLI entry                       | 4      | 2          |
| 15  | Derive the preload thread count from `availableParallelism()`        | 3      | 3          |
| 16  | Content-addressed on-disk transpile cache                            | 9      | 8          |
| 17  | Reshape `parallelPreload` to transpile into the cache                | 6      | 7          |
| 18  | Bypass `ts-node` in the esbuild ESM `load` path; async `transform()` | 7      | 6          |
| 19  | Invert Gherkin parsing ahead of support loading                      | 3      | 5          |
| 20  | Lightweight `bindings` entry point; drop `./cli` from the barrel     | 4      | 4          |
| 21  | `module.registerHooks()` for the ESM path                            | 6      | 7          |
| 22  | Concurrent `import()` of support files                               | 5      | 6          |
| 23  | Expose `reloadSupport()` as a CLI watch mode                         | 6      | 7          |
| 24  | Persisted `pattern → source file` index for filtered runs            | 8      | 9          |
| 25  | esbuild `build()` bundling to replace per-file `transformSync`       | 6      | 10         |

These are the original, pre-measurement ratings and are kept as written. Items 15–17 and 22–25 were re-rated
against measured numbers after Phase 5; see [Re-rating after Phase 5](#re-rating-after-phase-5), which
supersedes this table for those items and adds items 26–28.

## Item ratings

### 1. `TSFLOW_TIMING` phase instrumentation plus a slowest-files table

**Impact 2.** Instrumentation makes nothing faster, and on the strict reading of this axis that is the
whole answer. The rating is 2 rather than 1 only because a slowest-files table typically exposes one or
two pathological files that turn out to be trivially fixable. Its actual value — that it is the
prerequisite for ranking items 16 through 25 honestly, and the regression test that keeps any of this from
silently reverting — does not live on this axis at all, and the low number here should not be read as an
argument against doing it first.

**Complexity 4.** The mechanical work is easy but the placement is not. Timings have to be collected in
the main process, in each forked child of
[worker.ts](../../../cucumber-tsflow/src/runtime/parallel/worker.ts), and in each preload thread of
[loader-worker.ts](https://github.com/LynxWall/cucumber-js-tsflow/blob/a9f7946fc3a51937746878692f47b2526c605835/cucumber-tsflow/src/api/loader-worker.ts), then aggregated so the N+1 multiplication
is visible rather than inferred. That means another cross-boundary channel alongside the existing
`global.__CUCUMBER_TSFLOW_BINDINGREGISTRY` and `global.__LOADER_WORKER` singletons, and per-file timing
inside the ESM `load` hook has to cost nothing when the mode is off — the same discipline item 12 is about.

### 2. Track the running pickle's context on `MessageCollector`

**Impact 10.** This is the only item in the directory with measured numbers behind it, and they are large:
`getStepScenarioContext` in [message-collector.ts](../../../cucumber-tsflow/src/runtime/message-collector.ts)
walks every entry of `pickleMap` — the whole run, not the running scenario — and calls `hasMatchingStep`
per step, which builds a fresh `RegExp` on every comparison. The measured cost was 8.5 s at 200 scenarios
and 51.9 s at 500, per call site, and there are two call sites. The fix is an O(1) field read. Nothing else
on the worklist changes a superlinear cost into a constant one.

**Complexity 4.** `getHookScenarioContext` in the same class already looks up `pickle.id` directly, so the
shape is established, and `startTestCase` has the `ManagedScenarioContext` in hand at the moment it is
created. What raises this above trivial is that the current lookup can legitimately resolve to a
_different_ scenario's context whenever a step pattern matches text in another pickle — that is the bug,
but any support code that has come to depend on the accident needs the behavior change acknowledged
rather than assumed benign. It also has to hold in each parallel child, where the collector is per process
and the pickle set is a subset of the run.

### 3. Remove `files: true` and `TS_NODE_FILES` from the ESM services

**Impact 7.** The option triggers a full recursive `ts.sys.readDirectory` walk of the tsconfig `include`
set — `**/*` by default — and that walk is paid in the main process, again in every parallel child, and
again in every preload thread. On a large monorepo package that is seconds of pure filesystem traversal
per process, and it multiplies by the same 1/2/9/10 table as transpilation. Because all three ESM services
create a `ts-node` service, this hits the esbuild ESM path as well as the `ts-node` one.

**Complexity 1.** This is the cleanest item on the list, and the reason is the proof
[analysis-3.md](../analysis/analysis-3.md) supplies rather than any property of tsflow's own code. `config.fileNames`
is consumed at exactly one place, inside an `if (!transpileOnly)` branch, and every tsflow ESM service
sets `transpileOnly: true`. The result of the walk is therefore unreachable, which makes the removal a
deletion with no behavior to change and nothing to validate beyond confirming the services still
construct.

### 4. Memoize pattern-to-`RegExp` in `runtime/utils.ts`

**Impact 6.** Rated for the change made on its own, where it is large: the same measurement that produced
item 2's figures showed the memoization taking the 200-scenario shape from 8114 ms to 153 ms, a 53x
improvement, with no API change. The rating is 6 rather than 9 because the two items overlap almost
entirely — once item 2 removes the dominant caller, the surviving callers of `hasMatchingStep` are the two
in [gherkin-manager.ts](../../../cucumber-tsflow/src/gherkin/gherkin-manager.ts), which are on the `--debug-file`
path only. As sequenced defense in depth it is cheap insurance; as a standalone change it is a large win.

**Complexity 2.** `getRegTextForStep` is a pure function of its input — seventeen chained `String.replace`
passes and nothing else — so a `Map<string, RegExp>` in front of it cannot change a result. The only
consideration worth a sentence is unbounded growth, and the key space is the set of distinct step patterns
in the suite, which is bounded by the binding count.

### 5. `Map` lookups in `updateSupportCodeLibrary`

**Impact 7.** The nine `findByKey` closures in
[binding-registry.ts](../../../cucumber-tsflow/src/bindings/binding-registry.ts) each do a linear `Array.find`
over a definition array, and the loop below calls one per registered binding, giving O(bindings ×
definitions). At three thousand bindings that is roughly nine million property reads; at ten thousand it
is a hundred million, which is seconds of CPU. It is also worse than any single document reported: the
verification in [performance-enhancement-analysis-2.md](../analysis/performance-enhancement-analysis-2.md) found three
non-worker call sites (`load-support.ts:88`, `load-support.ts:148`, `run-cucumber.ts:145`) plus
`worker.ts:109`, so a `parallel: 8` run pays it well over a dozen times.

**Complexity 2.** Purely mechanical, contained in one method, and the precedent sits in the same file —
`_cucumberKeyIndex` already builds exactly this kind of map for the reverse direction. Build one
`Map<cucumberKey, definition>` per definition array before the loop and the nine closures become nine map
reads.

### 6. Precompile the tsconfig path-mapping regexes

**Impact 5.** `rewritePathMappings` constructs a `new RegExp` per tsconfig path entry per transpiled file
in [esbuild.mjs](../../../cucumber-tsflow/src/transpilers/esm/esbuild.mjs), and
[tsnode-loader.mjs](../../../cucumber-tsflow/src/transpilers/esm/tsnode-loader.mjs) does the same and adds a
`searchRegex.test(code)` full-source pass before the `replace()` pass. Twenty aliases across two thousand
files is forty thousand compilations and eighty thousand whole-file scans. The compilations are cheap
individually; the repeated scans over megabytes of source are the larger half. Held below 7 because it
only bites on projects that actually define a substantial set of path aliases.

**Complexity 2.** The patterns are a function of `tsconfig.json` alone, which is read once per process, so
they can be built lazily into a module-scope array on first use. Two files, no cross-boundary contract,
and the existing `pathResolutionCache` in the same area shows the codebase already accepts caching at this
layer.

### 7. Resolution cache on `specifier + parentURL`; thunk the ESM hooks

**Impact 7.** `resolveWithExtensions` in
[loader-utils.mjs](../../../cucumber-tsflow/src/transpilers/esm/loader-utils.mjs) tries seven extensions and
then seven `index.*` variants with a synchronous `existsSync` for each, giving up to fourteen stat
syscalls per extensionless specifier and no cache of either outcome — the same specifier resolved from ten
files probes the disk ten times. Resolves number in the tens of thousands on a large support tree, and
`stat` is materially more expensive on Windows, which is where the reported slowness comes from. The
second half of the item removes the eager `await getLocalEsmHooks()` that runs on every resolve including
bare `node_modules` specifiers, which also stops a full `ts-node` service construction from happening
during the very first resolution before it is known to be needed.

**Complexity 3.** A `Map` keyed on `specifier + parentURL`, with the adjacent `pathResolutionCache` as
precedent, and a thunk in place of an awaited argument. The one real hazard is caching negative results:
a specifier that does not resolve now may resolve later if a file appears, which is fine for a one-shot CLI
run but becomes a correctness problem the moment item 23's watch mode exists, so the negative cache wants
a documented lifetime rather than process-lifetime by default.

### 8. Lazy callsite resolution, `Error.stackTraceLimit`, backslash fix

**Impact 6.** `Callsite.capture()` in [our-callsite.ts](../../../cucumber-tsflow/src/utils/our-callsite.ts) runs
at decorator-factory evaluation time for every `@given`, `@when`, `@then` and hook in every support file.
Each call mutates the global `Error.prepareStackTrace` twice — a known V8 stack-trace deoptimization
trigger — and materializes a full structured stack with the default `stackTraceLimit` purely to read frame
`[2]`. `source-map-support` memoizes per file, so the `SourceMapConsumer` parse is once per support file
rather than once per binding, which correctly sizes the prize: thousands of stack walks plus one map parse
per file, all on the load critical path, in every process and every preload thread.

**Complexity 5.** Deferring resolution is not a local change, because two consumers need the resolved
values for different reasons. `updateSupportCodeLibrary` reads `callsite.filename` and
`callsite.lineNumber` to back-patch `uri`/`line` onto the CucumberJS definitions, which is batchable after
loading. Harder, `isSameStepBinding` in
[binding-registry.ts](../../../cucumber-tsflow/src/bindings/binding-registry.ts) compares
`callsite.filename` when deduplicating, so the deferred representation has to preserve whatever identity
the dedupe currently relies on or duplicate detection changes shape. The bundled backslash fix is a
one-line change with an outsized validation surface: any spec expectation containing a path becomes
platform-dependent in a way it previously was not.

### 9. Hoist tag lowercasing, step-hook filtering, definition lookups

**Impact 5.** Three separate per-step costs. `hasMatchingTags` in
[utils.ts](../../../cucumber-tsflow/src/runtime/utils.ts) puts `tags.map(tag => tag.toLowerCase())` inside the
predicate handed to `lep.parse`, so the whole array is re-mapped for every token the expression parser
evaluates. In [test-case-runner.ts](../../../cucumber-tsflow/src/runtime/test-case-runner.ts),
`getBeforeStepHookDefinitions` and `getAfterStepHookDefinitions` re-filter the support library by
`appliesToTestCase(this.pickle)` on every step, and the "after" variant allocates a fresh
`.slice(0).reverse()` each time; `findHookDefinition` rebuilds a concatenated array of all before and
after hook definitions per hook step and then linear-scans it, and `findStepDefinition` linear-scans
`stepDefinitions` per step. Together these scale as steps × definitions, which is real on a large suite
but an order below item 2.

**Complexity 2.** `this.pickle` is fixed for the runner's entire lifetime, so both hook lists are safely
constructor-time values, and the two `find` scans become `Map<id, definition>` indexes built once per run.
Mechanical, contained in two files, and with no behavioral difference to reason about beyond the
identity of the returned arrays.

### 10. Send resolved paths to parallel children instead of re-globbing

**Impact 4.** [worker.ts](../../../cucumber-tsflow/src/runtime/parallel/worker.ts) calls `resolvePaths` again at
line 81 even though the coordinator already holds the resolved lists and is already sending
`supportCodeCoordinates` in the `INITIALIZE` command, so a `parallel: 8` run performs nine full glob
passes over the project tree instead of one. The rating is held at 4 rather than higher because the
children fork at once and glob concurrently, so the wall-clock saving is roughly one glob's duration plus
the contention, not N globs' worth — the win is real but it is a fixed cost, not a scaling one.

**Complexity 4.** This extends the coordinator-to-child IPC contract in
[adapter.ts](../../../cucumber-tsflow/src/runtime/parallel/adapter.ts), which is the kind of change that has to
be right in both directions or the child silently loads a different support set than the coordinator
registered. The worker's `resolvePaths` result is also used for more than the support lists, so the
feature-coordinate path has to keep working, and the change needs testing under every transpiler in the
matrix because the CJS and ESM branches consume different fields of it.

### 11. Hoist `shortUuid()`; index the `registerStepBinding` dedupe

**Impact 3.** Two small per-binding allocations. `shortUuid().new()` appears at eight call sites across
[step-decorators.ts](../../../cucumber-tsflow/src/bindings/step-decorators.ts) and
[hook-decorators.ts](../../../cucumber-tsflow/src/bindings/hook-decorators.ts), constructing a fresh base58
translator for every binding rather than reusing one. `registerStepBinding` uses `Array.some` twice —
once over the pattern-and-tag group and once over the class's own bindings — making registration quadratic
in bindings per group. Both are genuinely marginal: the translator is a small object, and the quadratic
term only becomes visible in a class carrying several hundred steps, which is unusual.

**Complexity 3.** The `shortUuid` hoist is one line in each of two files and cannot fail. The dedupe index
is what earns the 3: `isSameStepBinding` applies two different comparison rules — hooks compare binding
type and method name in addition to callsite, steps do not — so a composite key has to reproduce that
branch faithfully. Getting it wrong either admits a duplicate binding or silently drops a legitimate one,
and the spec matrix's `validations` coverage is the only thing that would catch it.

### 12. Guard hot-path `logger.checkpoint` arguments behind `isVerbose()`

**Impact 3.** `createLogger` in [tsflow-logger.ts](../../../cucumber-tsflow/src/utils/tsflow-logger.ts) reads
`TSFLOW_VERBOSE` once and early-returns, but the early return is inside the function, so every call site
still allocates its detail object and evaluates its template strings first. Most of that is small garbage
on the hottest loop in the system, which is why this is a 3 rather than a 1 — and one case is worse than
garbage: `loadVue` computes `source?.toString()?.length`, a full buffer-to-string conversion per file,
solely to produce a number that is immediately discarded.

**Complexity 1.** `isVerbose()` is already exported from the same file (and from its `.mjs` twin for the
loaders), so the work is to wrap the hot call sites in the resolve and load hooks and in `transpile`, and
leave the CLI and configuration call sites exactly as they are. There is no behavior to preserve because
the discarded values are already discarded.

### 13. Delete the hardcoded `cucumber-tsflow-specs` check in `supports()`

**Impact 1.** Zero, and honestly so. The `if (!filename.includes('cucumber-tsflow-specs')) return false;`
guard in [esbuild.mjs](../../../cucumber-tsflow/src/transpilers/esm/esbuild.mjs)'s exported `supports()` is dead
code — `supports` is exported from both that file and
[esbuild.ts](../../../cucumber-tsflow/src/transpilers/esbuild.ts) and imported by nothing — so removing it
changes no timing at all. It is on the worklist because it would silently disable transpilation for every
consumer project the moment anyone wired it up, and because the two exported predicates currently
disagree (the CJS version has no such check), which is a trap independent of performance.

**Complexity 1.** A deletion of dead code. The only judgment required is whether to delete both
`supports()` exports outright, given neither has a consumer, or to reconcile them — and either choice is
safe precisely because nothing imports them.

### 14. `module.enableCompileCache()` in the CLI entry

**Impact 4.** Node's compile cache persists V8 bytecode across processes, which attacks parse-and-compile
cost rather than TypeScript-to-JavaScript cost and therefore composes with item 16 rather than overlapping
it. Given the size of the module graph — `@cucumber/cucumber`, the formatter tree, the transpilers, and the
whole support tree in every one of N+1 processes — the ceiling is high. The rating is held to 4 because
the ceiling is unverified in the one configuration that matters: whether sources produced by a custom ESM
loader are cacheable at all is exactly what [analysis-3.md](../analysis/analysis-3.md) flags as unknown, and if they
are not, the win collapses to the library's own modules.

**Complexity 2.** A few guarded lines at the top of the CLI entry. The `NODE_COMPILE_CACHE` environment variable
arrived in Node 22.1.0 but the programmatic `module.enableCompileCache()` came later, in 22.8.0, and the
package's `engines` floor is `>=22.0.0`, so the guard is a `typeof` check rather than a version branch. The complexity here is not in the code; it is that this item cannot be evaluated
without item 1's instrumentation, which is a sequencing constraint rather than an implementation
difficulty.

### 15. Derive the preload thread count from `availableParallelism()`

**Impact 3.** `Math.min(availableParallelism(), 4)` in
[parallel-loader.ts](https://github.com/LynxWall/cucumber-js-tsflow/blob/a9f7946fc3a51937746878692f47b2526c605835/cucumber-tsflow/src/api/parallel-loader.ts) leaves most of a modern CI runner idle
during what is claimed to be the bottleneck phase. But as the phase currently stands it produces nothing
the authoritative load can reuse, so raising the cap scales up work whose output is discarded — the honest
rating today is that lifting the cap makes startup slower. The 3 is the value this has _after_ item 17
gives the phase something durable to produce, which is why the worklist sequences it there.

**Complexity 3.** The expression itself is trivial. What is not trivial is that each preload thread costs
a `ts-node` service, its own esbuild `worker_threads` service plus Go child process, and on the Vue path
its own JSDOM, so an unbounded count can oversubscribe badly. The interaction with the `parallel` worker
count has to become explicit rather than accidental, and that is a decision about resource policy that
needs the item 1 numbers to settle.

### 16. Content-addressed on-disk transpile cache

**Impact 9.** The largest structural win available. There is no transpile cache anywhere in the codebase —
zero `writeFileSync`, `mkdirSync` or `createHash` occurrences in `cucumber-tsflow/src`, `transformSync` is
a pure in-memory call, and `ts-node-maintained` caches only in a per-process `Map`. The consequence is the
1/2/9/10 multiplier table: a `parallel: 8` run with `parallelLoad` transpiles every support file ten times,
and the next identical run does it ten times again. A cache collapses that to one cold transpile shared by
every process and reduces every subsequent run to a file read. Held at 9 rather than 10 only because the
payoff is conditional on unchanged sources, so a cold CI run gets comparatively little.

**Complexity 8.** The failure mode is what sets this so high: a wrong cache key does not crash, it runs
stale code and reports a passing or failing suite that does not correspond to the source on disk. The key
has to include source bytes, transpiler identity, resolved compiler options, `global.experimentalDecorators`,
the Vue style flag, the tsflow version, and the esbuild, `ts-node` and Vue compiler versions — and, per
[analysis-3.md](../analysis/analysis-3.md), the `absoluteBaseUrl`, because `rewritePathMappings` bakes absolute
`file://` URLs into the output so entries are not portable across checkout paths. On top of the key there
are two integration points to cover both module systems (`EsbuildTranspiler.transpile` for CJS and the ESM
`load` hook), a size-bounded eviction policy, a `--no-transpile-cache` escape hatch, and the
coordinator-versus-children thundering herd where N+1 processes race to populate an empty cache.

### 17. Reshape `parallelPreload` to transpile into the cache

**Impact 6.** The phase is currently net-negative: it is documented as warming an on-disk cache that does
not exist, its worker descriptors are collected and used only to print a count, and the threads are
terminated so their thread-local transpilation output is discarded before the main thread does a
completely cold load. Reshaping it from "evaluate every module in N threads" to "transpile every module
into the cache in N threads" turns that cost into a real parallel warm pass. The rating is 6 rather than
higher because most of what it recovers is the cold-run half of item 16's win — on a warm cache there is
little left to parallelize.

**Complexity 7.** It cannot be started before item 16 exists, since the cache is the thing being written.
The substantive difficulty is that evaluating a module naturally pulls in its imports whereas a
transpile-only pass has to discover them, which means an esbuild `metafile` scan over the support entry
points as a replacement for transitive discovery. Against that, transpiling needs no browser globals, so
the change deletes the roughly 160-line `window` shim at the top of
[loader-worker.ts](https://github.com/LynxWall/cucumber-js-tsflow/blob/a9f7946fc3a51937746878692f47b2526c605835/cucumber-tsflow/src/api/loader-worker.ts) and removes the hazard of running
module-level side effects N+1 times — a genuine simplification, but one that changes behavior on the Vue
paths and therefore needs the `*-vue*` workspaces run deliberately.

### 18. Bypass `ts-node` in the esbuild ESM `load` path; async `transform()`

**Impact 7.** On the `es-node-esm` path, `.ts` files are handed to `tsNodeHooks.load()`, so a single
`esbuild.transform` is wrapped in a `ts-node` service, module-type classification, `ts-node`'s resolver
and its source-map plumbing — and that plumbing is a `JSON.parse` plus `JSON.stringify` plus base64
encode per file, appended to the module source so it roughly doubles the string V8 has to allocate and
scan. Removing that is worth real time on its own. The larger half is that it unblocks the async
`transform()` API: `transformSync` posts to an internal `worker_threads` service and blocks on
`Atomics.wait`, so no two files can be in flight at once, and since `require` is synchronous the ESM
loaders are the only path that can ever parallelize transpilation at all.

**Complexity 6.** The `load` hook has to take over everything `ts-node` was contributing — the CJS-versus-ESM
format decision, source-map attachment, and any resolution behavior consumers have come to rely on — and
the blocker on going async is precisely that `ts-node`'s `Transpiler.transpile` interface is synchronous
by contract, so the two halves of this item are one change rather than two. It touches every esbuild ESM
variant in the matrix, which is four of the eight spec workspaces.

### 19. Invert Gherkin parsing ahead of support loading

**Impact 3.** `getSupportCodeLibrary` runs at `run-cucumber.ts:131` and `updateSupportCodeLibrary` at
`:145`, while `getPicklesAndErrors` does not run until `:182`, so `--name "one scenario"` transpiles and
evaluates the entire support tree before discovering it needs three files. That framing is the biggest
everyday cost identified anywhere in the directory — but this item is only the conservative half of the
fix, and the early exit it enables fires only when the filter matches _nothing_, which is a typo case
rather than a workflow. Reordering alone skips no loading. The win this framing points at belongs to item 24.

**Complexity 5.** Reordering the top-level phases of
[run-cucumber.ts](../../../cucumber-tsflow/src/api/run-cucumber.ts) means pickle parsing and filtering happen
before support code has been evaluated, and support code is what registers parameter types, the snippet
syntax and the `supportCodeIds` the runtime and formatters consume. Establishing which of those the filter
path genuinely needs, and in what order, is the work. Orchestrator reordering is also where subtle
breakage hides: the matrix will catch a hard failure but not a formatter that silently loses definition
metadata.

### 20. Lightweight `bindings` entry point; drop `./cli` from the barrel

**Impact 4.** [index.ts](../../../cucumber-tsflow/src/index.ts) does `import { default as _Cli } from './cli'`
for the deprecated `Cli` export, so every support file importing a decorator from the package root
transitively pulls in `run-cucumber`, `make-runtime`, the parallel adapter, the Gherkin manager, the whole
`@cucumber/cucumber` formatter tree, `ansis` and `debug` — none of which is needed to evaluate a
decorator. It is a one-time cost per process, but "per process" means the coordinator plus N children plus
every preload thread, and it sits ahead of the first transpile. Capped at 4 because it is a fixed graph
cost rather than a scaling one, and because the new entry point only pays off for consumers who migrate
their imports.

**Complexity 4.** The new entry point needs a matching key in the `exports` map of
[package.json](../../../cucumber-tsflow/package.json), and following the pattern already there it needs a
hand-written `.mjs` wrapper copied into `lib/` by the build, which puts this in contact with the build
rules in [CLAUDE.md](../../../CLAUDE.md) rather than just the source. Dropping `./cli` from the root barrel is
the sharper part: `Cli` is a deprecated public export, so removing it is a breaking change that needs a
deprecation path rather than a deletion.

### 21. `module.registerHooks()` for the ESM path

**Impact 6.** Hooks registered through `register()` run on a dedicated loader thread, so every `resolve`
and every `load` is an asynchronous `postMessage` round trip and every `load` result carries the full
transformed source back across the thread boundary by structured clone. On a large support tree that is
thousands of round trips plus megabytes of copying, and `module.registerHooks()` removes both by running
the hooks synchronously on the main thread. It landed in Node 23.5.0 and was backported to 22.15.0, which
is above the package's current `>=22.0.0` `engines` floor — so this item carries either an `engines` bump
or a runtime fallback to `register()` as part of its scope. This is the one substantial finding unique to
[analysis-2.md](../analysis/analysis-2.md).

**Complexity 7.** Synchronous hooks and item 18's async `transform()` pull in opposite directions, and that
conflict has to be resolved deliberately rather than discovered: whichever lands second constrains the
first. The `loadVue` path awaits `nextLoad` and is genuinely asynchronous, so it either stays on
`register()` or needs restructuring. Practically this means supporting both registration mechanisms for a
period, which doubles the surface the matrix has to cover on the four ESM workspaces.

### 22. Concurrent `import()` of support files

**Impact 5.** [support.ts](../../../cucumber-tsflow/src/api/support.ts) awaits each `import()` to completion —
resolve round trip, load round trip, transform, evaluate — before starting the next, so the loader thread
sits idle between modules and the esbuild service sits idle between transforms. Pipelining that is a
sizeable cold-load win on the ESM paths. It is a 5 rather than a 7 because it overlaps items 16 and 18:
once transpilation is cached or concurrent, what remains serialized is module evaluation, which is
CPU-bound on one thread either way.

**Complexity 6.** Registration order changes, and registration order is load-bearing here in two places:
it determines the order in which ambiguity errors surface, which the `validations` specs assert, and
`isSameStepBinding` deduplication compares callsites in whatever order bindings arrive.
[analysis-3.md](../analysis/analysis-3.md)'s variant — a concurrent transpile-only warm pass followed by the existing
serial evaluation loop — is the safer shape and keeps order deterministic, but it only helps if the warm
pass writes somewhere durable, which makes it dependent on item 16.

### 23. Expose `reloadSupport()` as a CLI watch mode

**Impact 6.** A long-lived process keeps the transpiled modules, the `ts-node` service, the resolution
caches and the V8 compilation of the whole graph hot, which reduces the second and every subsequent run in
a development session to close to nothing — a better outcome for the inner loop than any cache, because it
skips the file reads too. It is a 6 rather than higher because it is entirely a developer-workflow win: it
does nothing for CI, and nothing for a consumer who does not adopt a watch command.

**Complexity 7.** The delta-aware eviction logic already exists at `load-support.ts:107` with no
command-line surface, which makes the item look cheaper than it is. The eviction walks `require.cache` and
deletes entries — a CJS mechanism with no ESM equivalent, since the ESM module registry cannot be
invalidated. Half of the supported matrix therefore needs a different strategy entirely, whether that is
cache-busting URL query parameters or accepting that ESM watch mode restarts the process. On top of that
sit the new CLI surface, file watching, and re-entering the runtime in a process whose `BindingRegistry`
singleton and `global.messageCollector` were not designed to be reset.

### 24. Persisted `pattern → source file` index for filtered runs

**Impact 8.** This is the item that actually collects the win item 19 points at: for the everyday "run one
scenario in a huge suite" case it is the difference between a minute and a second, because only the files
whose patterns appear in the selected pickles get loaded. Since filtered runs are most of what a developer
does, the aggregate effect on the inner loop is larger than anything except item 2. Held at 8 rather than
10 because it does nothing at all for a full run or a CI run, and because it is the least proven proposal
in the directory — its own source document says so.

**Complexity 9.** The registry has `toDescriptors()` and `getDescriptorSourceFiles()` but no
`fromDescriptors()`, so the hydration side does not exist yet. Beyond that, the correctness argument is
the hard part: hooks, context classes, and any module with load-time side effects must always load
regardless of the index, any unresolved pattern must fall back to a full load, and the index must be
invalidated on source change. The failure mode is the worst on the list — loading too few files does not
error, it reports an undefined step, which reads as a broken test rather than a broken cache. It belongs
behind a flag with a full-load fallback, and it should not be attempted before item 1 can show what it
actually saves.

### 25. esbuild `build()` bundling to replace per-file `transformSync`

**Impact 6.** One `build()` invocation with `bundle: true`, `packages: 'external'` and a `metafile` would
replace N × (resolution + IPC + transform) and let esbuild parallelize internally across cores, which is
the only proposal that recovers esbuild's actual advantages rather than working around the fact that the
current architecture discards them. The rating is 6, not higher, for two reasons: the figure is entirely
derived, and items 16, 18 and 22 between them capture much of the same ground by safer routes, so the
marginal win over that stack is smaller than the win over today's code.

**Complexity 10.** The highest on the list, and it is the correctness argument rather than the code that
puts it there. Decorator registration depends on module identity and on evaluation order across separate
files, so bundling must preserve per-file callsite information — source maps can carry it, but
`isSameStepBinding` and `updateSupportCodeLibrary` both consume it — and must not collapse two files that
register the same step pattern into a single module identity. It also has to interact correctly with the
Vue SFC compiler path, tsconfig path aliases, and both decorator modes. Nothing here can be validated by
the twenty-eight-scenario matrix, which means a prototype behind a config flag measured against a real
large suite is the minimum responsible path.

## What the ratings reveal

### Do first: high impact, low complexity

Six items rate 5 or above on impact and 3 or below on complexity, and item 2 misses the complexity cut by
a single point while carrying the highest impact on the list, so it heads the group regardless. They are
independent of each other, carry no architectural risk, and between them address both the dominant
runtime cost and the dominant per-process startup costs.

1. **Item 2** (impact 10, complexity 4) — the single largest win in the directory, the only one with
   measurements behind it, and the only one that changes a superlinear cost into a constant. Its
   complexity is a 4 rather than a 2 purely because the behavior change wants acknowledging.
1. **Item 3** (impact 7, complexity 1) — the best ratio on the list. A deletion with a proof of safety
   attached, removing a full recursive directory walk per process, per child and per preload thread.
1. **Item 5** (impact 7, complexity 2) — removes an O(bindings × definitions) traversal paid four times
   per process, with the fix already demonstrated by `_cucumberKeyIndex` in the same file.
1. **Item 7** (impact 7, complexity 3) — up to fourteen uncached `existsSync` calls per specifier across
   tens of thousands of resolves, with `pathResolutionCache` as precedent.
1. **Item 4** (impact 6, complexity 2) — large on its own, cheap insurance once item 2 lands, and pure by
   construction.
1. **Items 6 and 9** (impact 5, complexity 2 each) — mechanical hoists that remove work scaling with
   aliases × files and steps × definitions respectively.

Item 12 (impact 3, complexity 1) belongs in the same pass on cost grounds even though its impact is
modest, and item 13 (impact 1, complexity 1) belongs there for correctness rather than performance.

### Free but marginal

Items 11, 12, 13 and 15 all rate 3 or below on impact and 3 or below on complexity. None of them will be
visible in a stopwatch. They are worth doing while in the neighboring code — item 13 in particular is a
latent trap rather than a slow path, and item 15 is a one-expression change that should not be made at all
until item 17 gives the preload phase a durable output.

### Needs item 1 before it can be justified

Four items have a high or wide impact range that is derived rather than observed, and committing to any of
them on reasoning alone means committing to a number nobody has measured.

- **Item 14** (impact 4, complexity 2) — trivially cheap to write, but the compile cache's interaction
  with loader-produced sources is unknown, so its real value could be anywhere from near zero to
  substantial.
- **Item 24** (impact 8, complexity 9) — the biggest everyday win claimed anywhere and the least proven
  thing in the directory.
- **Item 25** (impact 6, complexity 10) — an entirely derived figure against the most expensive
  implementation on the list.
- **Item 10** (impact 4, complexity 4) — the only way to know whether nine concurrent glob passes cost
  wall-clock time or merely CPU is to measure them.

### One coupled decision

Items 16, 17 and 18 are three parts of one architectural commitment, and their ratings show why they
cannot be taken separately: item 16 carries the impact (9) and most of the risk (8), item 17 is
unstartable without it, and item 18 is the change that makes concurrent transpilation possible on the only
path that permits it. Item 22's safe variant also lands inside this group, since a concurrent warm pass
needs somewhere durable to warm. Committing to any one of the four is committing to the shape of all
four.

### High complexity, standalone

Items 21 and 23 rate 7 on complexity without belonging to the cache group, and each carries a specific
structural obstacle that dominates the estimate rather than the volume of code.

- **Item 21** (impact 6, complexity 7) — `module.registerHooks()` is synchronous and item 18 wants async,
  so these two constrain each other; whichever lands first sets the terms for the other.
- **Item 23** (impact 6, complexity 7) — the existing eviction logic is `require.cache`-based and
  therefore CJS-only, so half the supported matrix needs a mechanism that does not exist yet.

### Reordering versus re-indexing

Items 19 and 24 are the conservative and ambitious halves of the same idea, and separating their ratings
is the clearest single argument for splitting them. Item 19 costs a 5 in complexity to buy a 3 in impact,
which is a poor trade on its own terms — it is worth doing as the structural precondition for item 24
(impact 8), not for the early exit it enables. Anyone weighing item 19 in isolation is weighing the wrong
thing.

## Re-rating after Phase 5

Written after Phase 5, with five phases of measurements behind it. The original ratings were reasoned from the
source; these are re-read against what the UIS `dim` profile actually measures now (324 scenarios, 200 files
loaded through the ESM hooks, serial, no `parallelLoad`), warm:

| Where the time goes (dim, warm)           | ms     | Notes                                                                 |
| ----------------------------------------- | ------ | --------------------------------------------------------------------- |
| `bootstrap` (CLI module graph)            | ~400   | fixed per process                                                     |
| `esm:hooks-init` (import esbuild loader)  | ~80    | fixed per thread                                                      |
| `esm:resolve` (2828 calls)                | ~650   | cached probes; mostly Node's own resolver behind `nextResolve`        |
| `esm:load` (920 files), of which esbuild  | ~800 / ~700 | 200 `.ts`/`.vue` files transpiled; the rest is JSON/asset/passthrough |
| module evaluation (`support:import` rest) | ~1300  | `test-setup.mjs` 0.8 s, jsdom set-up 0.5 s, the step files themselves |
| `gherkin` + `formatters:init` + rest      | ~100   |                                                                       |
| **startup total**                         | **~2.9 s** | was 24–29 s before Phase 4                                        |
| `runtime:run`                             | 37–47 s | 1363 steps; not attributed between tsflow and consumer code          |

Two things follow. First, startup is no longer where a large consumer's time goes: `runtime:run` is more than
ten times the whole of startup, and nothing since Phase 2 has looked at it. Second, every remaining startup
item is now competing for pieces of 2.9 s, and several of the original ratings assumed a 25 s budget.

| #   | Change                                          | Old I/C | New I/C | Why                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | ----------------------------------------------- | ------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 15  | Preload thread count from `availableParallelism()` | 3 / 3 | 1 / 3   | Only meaningful if `parallelLoad` survives. `origin/Dev-Prebuild` ("Remove parallel load support") suggests it may not; settle that before touching it.                                                                                                                                                                                                                                                                                       |
| 16  | Content-addressed on-disk transpile cache       | 9 / 8   | 4 / 7   | esbuild is ~0.7 s of the 2.9 s on `dim` (200 files). It scales with file count, so perhaps 2–3 s on the `default` profile's ~209 step files plus components, and by N+1 under `parallel`/`parallelLoad`. Real, but a quarter of the original claim. One design bonus: on a full cache hit the loader need not import esbuild at all, saving `esm:hooks-init` and the esbuild service spawn (~80 ms each). Complexity down one because the esbuild ESM integration point is now a single synchronous function, `loadTypeScript()`. |
| 17  | Reshape `parallelPreload` to transpile into the cache | 6 / 7 | 2 / 7 | With no on-disk cache, preload today is pure duplicated work for the esbuild transpilers (the spec report shows every file evaluated once per worker and again in main). Either item 16 lands and this follows, or `parallelLoad` is removed and this is deleted. Contingent on the same decision as 15.                                                                                                                                             |
| 19  | Invert Gherkin parsing ahead of support loading | 3 / 5   | 3 / 5   | Unchanged; still only the precondition for 24.                                                                                                                                                                                                                                                                                                                                                                                                   |
| 22  | Concurrent `import()` of support files          | 5 / 6   | 1 / 6   | **Drop.** In-thread hooks block the importing thread while esbuild runs, so concurrent `import()` cannot overlap transpilation; module evaluation was always single-threaded. Nothing left to recover.                                                                                                                                                                                                                                              |
| 23  | `reloadSupport()` as a CLI watch mode           | 6 / 7   | 5 / 7   | Still the best inner-loop outcome, but it now saves ~3 s of startup per run rather than 25 s. The ESM-eviction problem is unchanged.                                                                                                                                                                                                                                                                                                                |
| 24  | Persisted `pattern → source file` index         | 8 / 9   | 7 / 9   | Still the largest lever for filtered runs on a big suite, but its value is bounded by the `default` profile's startup, which has never been measured — measure it before committing. Correctness risk unchanged.                                                                                                                                                                                                                                    |
| 25  | esbuild `build()` bundling                      | 6 / 10  | 5 / 10  | What it would remove is now the ~1.5 s of resolve + load hook execution plus Node's per-module ESM overhead, and the sync hooks already took the IPC out. Still last; still unvalidatable by the matrix.                                                                                                                                                                                                                                             |
| 26  | **New: startup feedback (DX)**                  | —       | DX / 3  | Between the CLI banner and the first formatter output the process is silent for the whole of startup — on a cold or large run, tens of seconds with no sign of life. `getSupportCodeLibrary` already loops over every support file with a per-file timer, so a TTY progress line ("Loading support code 34/209 · frequency-controls.steps.ts") and a one-line summary ("Loaded 209 files in 3.1 s, es-vue-esm, in-thread hooks") are cheap. Candidates beyond that: promote `TSFLOW_TIMING` to a `--timing` flag, name the phase in progress (`config`, `preload`, `loading`, `parsing`), report the hooks mode and Node version in `--verbose`, surface transpile errors with the file and a code frame rather than a stack. Open-ended by design. |
| 27  | **New: attribute `runtime:run`**                | —       | ? / 2   | 37–47 s of a 48 s run. A `--cpu-prof` capture of the `dim` run, split between `@lynxwall/cucumber-tsflow/lib`, `@cucumber/cucumber`, jsdom/Vue and the consumer's steps, is the cheapest way to learn whether there is any tsflow cost left worth a phase. Phase 2 removed the known hot paths; this checks for unknown ones. Impact is unknowable until measured, which is the point.                                                            |
| 28  | **New: ESM callsite source mapping**            | —       | correctness / 3 | ESM step definitions report the compiled line, not the TypeScript line (Phase 4 notes). Phase 5 put the transpiled output and its inline map on the resolving thread, so `loadTypeScript()` can record `url → map` and `Callsite.resolve()` can consult it. Needs a source-map decoder as a direct dependency (`source-map`, `source-map-js` and `@jridgewell/trace-mapping` are all already in the tree transitively). Only the esbuild loaders; the ts-node loaders would still need the map sent over the `MessageChannel`. |

### What the re-rating changes

- The coupled cache commitment (16, 17, 22) is no longer a single 9-rated architectural decision; it is a
  4-rated cache whose two satellites depend on a product decision about `parallelLoad` that belongs to the
  owner, not to a performance phase. It moves down the order and item 22 leaves the list.
- Developer experience moves up. The startup silence is now the most noticeable thing about a large run
  that tsflow controls, and item 26 is cheap.
- The next _performance_ question is item 27, not any startup item. If the profile shows tsflow overhead
  in `runtime:run`, that is a bigger phase than anything left here; if it shows none, the startup items can
  be weighed on their own merits knowing they are the whole remaining budget.
