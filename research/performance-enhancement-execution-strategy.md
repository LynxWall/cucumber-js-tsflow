# Performance Enhancement Execution Strategy

This document rates each of the twenty-five changes on the consolidated worklist in
[performance-enhancement-analysis-2.md](performance-enhancement-analysis-2.md) on two independent axes:
how much performance is recovered if the change is made, and how hard the change is to implement
correctly and validate. The worklist itself is the merge of the three investigations in this directory —
[performance-analysis.md](performance-analysis.md), [analysis-2.md](analysis-2.md) and
[analysis-3.md](analysis-3.md) — and the item numbers here are that worklist's numbers, unchanged, so the
two documents can be read side by side.

Nothing is added and nothing is dropped. The purpose is to replace the worklist's single
confidence-times-payoff-over-risk ordering with two separable numbers, because that ordering conflates
changes that are large and easy with changes that are large and dangerous, and those want very different
treatment.

The ratings are judgements grounded in the source, not measurements. No benchmarks were run for this
document, and the only measured figures anywhere in the directory are the step-lookup microbenchmarks in
[performance-analysis.md](performance-analysis.md). That is precisely the gap item 1 exists to close, and
it is why several impact ratings below are explicitly marked as derived rather than observed.

## Rating scales

The two axes are deliberately independent. An item can be a 9 on impact and a 2 on complexity, or a 3 on
impact and a 9 on complexity, and both readings should be legible from the numbers alone. Neither axis is
allowed to colour the other: a change being easy is not evidence that it is valuable, and a change being
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

- **1** — A deletion, or a single hoist inside a pure function. There is no mechanism by which behaviour
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
[worker.ts](../cucumber-tsflow/src/runtime/parallel/worker.ts), and in each preload thread of
[loader-worker.ts](../cucumber-tsflow/src/api/loader-worker.ts), then aggregated so the N+1 multiplication
is visible rather than inferred. That means another cross-boundary channel alongside the existing
`global.__CUCUMBER_TSFLOW_BINDINGREGISTRY` and `global.__LOADER_WORKER` singletons, and per-file timing
inside the ESM `load` hook has to cost nothing when the mode is off — the same discipline item 12 is about.

### 2. Track the running pickle's context on `MessageCollector`

**Impact 10.** This is the only item in the directory with measured numbers behind it, and they are large:
`getStepScenarioContext` in [message-collector.ts](../cucumber-tsflow/src/runtime/message-collector.ts)
walks every entry of `pickleMap` — the whole run, not the running scenario — and calls `hasMatchingStep`
per step, which builds a fresh `RegExp` on every comparison. The measured cost was 8.5 s at 200 scenarios
and 51.9 s at 500, per call site, and there are two call sites. The fix is an O(1) field read. Nothing else
on the worklist changes a superlinear cost into a constant one.

**Complexity 4.** `getHookScenarioContext` in the same class already looks up `pickle.id` directly, so the
shape is established, and `startTestCase` has the `ManagedScenarioContext` in hand at the moment it is
created. What raises this above trivial is that the current lookup can legitimately resolve to a
_different_ scenario's context whenever a step pattern matches text in another pickle — that is the bug,
but any support code that has come to depend on the accident needs the behaviour change acknowledged
rather than assumed benign. It also has to hold in each parallel child, where the collector is per process
and the pickle set is a subset of the run.

### 3. Remove `files: true` and `TS_NODE_FILES` from the ESM services

**Impact 7.** The option triggers a full recursive `ts.sys.readDirectory` walk of the tsconfig `include`
set — `**/*` by default — and that walk is paid in the main process, again in every parallel child, and
again in every preload thread. On a large monorepo package that is seconds of pure filesystem traversal
per process, and it multiplies by the same 1/2/9/10 table as transpilation. Because all three ESM services
create a `ts-node` service, this hits the esbuild ESM path as well as the `ts-node` one.

**Complexity 1.** This is the cleanest item on the list, and the reason is the proof
[analysis-3.md](analysis-3.md) supplies rather than any property of tsflow's own code. `config.fileNames`
is consumed at exactly one place, inside an `if (!transpileOnly)` branch, and every tsflow ESM service
sets `transpileOnly: true`. The result of the walk is therefore unreachable, which makes the removal a
deletion with no behaviour to change and nothing to validate beyond confirming the services still
construct.

### 4. Memoize pattern-to-`RegExp` in `runtime/utils.ts`

**Impact 6.** Rated for the change made on its own, where it is large: the same measurement that produced
item 2's figures showed the memoization taking the 200-scenario shape from 8114 ms to 153 ms, a 53x
improvement, with no API change. The rating is 6 rather than 9 because the two items overlap almost
entirely — once item 2 removes the dominant caller, the surviving callers of `hasMatchingStep` are the two
in [gherkin-manager.ts](../cucumber-tsflow/src/gherkin/gherkin-manager.ts), which are on the `--debug-file`
path only. As sequenced defence in depth it is cheap insurance; as a standalone change it is a large win.

**Complexity 2.** `getRegTextForStep` is a pure function of its input — seventeen chained `String.replace`
passes and nothing else — so a `Map<string, RegExp>` in front of it cannot change a result. The only
consideration worth a sentence is unbounded growth, and the key space is the set of distinct step patterns
in the suite, which is bounded by the binding count.

### 5. `Map` lookups in `updateSupportCodeLibrary`

**Impact 7.** The nine `findByKey` closures in
[binding-registry.ts](../cucumber-tsflow/src/bindings/binding-registry.ts) each do a linear `Array.find`
over a definition array, and the loop below calls one per registered binding, giving O(bindings ×
definitions). At three thousand bindings that is roughly nine million property reads; at ten thousand it
is a hundred million, which is seconds of CPU. It is also worse than any single document reported: the
verification in [performance-enhancement-analysis-2.md](performance-enhancement-analysis-2.md) found three
non-worker call sites (`load-support.ts:88`, `load-support.ts:148`, `run-cucumber.ts:145`) plus
`worker.ts:109`, so a `parallel: 8` run pays it well over a dozen times.

**Complexity 2.** Purely mechanical, contained in one method, and the precedent sits in the same file —
`_cucumberKeyIndex` already builds exactly this kind of map for the reverse direction. Build one
`Map<cucumberKey, definition>` per definition array before the loop and the nine closures become nine map
reads.

### 6. Precompile the tsconfig path-mapping regexes

**Impact 5.** `rewritePathMappings` constructs a `new RegExp` per tsconfig path entry per transpiled file
in [esbuild.mjs](../cucumber-tsflow/src/transpilers/esm/esbuild.mjs), and
[tsnode-loader.mjs](../cucumber-tsflow/src/transpilers/esm/tsnode-loader.mjs) does the same and adds a
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
[loader-utils.mjs](../cucumber-tsflow/src/transpilers/esm/loader-utils.mjs) tries seven extensions and
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

**Impact 6.** `Callsite.capture()` in [our-callsite.ts](../cucumber-tsflow/src/utils/our-callsite.ts) runs
at decorator-factory evaluation time for every `@given`, `@when`, `@then` and hook in every support file.
Each call mutates the global `Error.prepareStackTrace` twice — a known V8 stack-trace deoptimization
trigger — and materializes a full structured stack with the default `stackTraceLimit` purely to read frame
`[2]`. `source-map-support` memoises per file, so the `SourceMapConsumer` parse is once per support file
rather than once per binding, which correctly sizes the prize: thousands of stack walks plus one map parse
per file, all on the load critical path, in every process and every preload thread.

**Complexity 5.** Deferring resolution is not a local change, because two consumers need the resolved
values for different reasons. `updateSupportCodeLibrary` reads `callsite.filename` and
`callsite.lineNumber` to back-patch `uri`/`line` onto the CucumberJS definitions, which is batchable after
loading. Harder, `isSameStepBinding` in
[binding-registry.ts](../cucumber-tsflow/src/bindings/binding-registry.ts) compares
`callsite.filename` when deduplicating, so the deferred representation has to preserve whatever identity
the dedupe currently relies on or duplicate detection changes shape. The bundled backslash fix is a
one-line change with an outsized validation surface: any spec expectation containing a path becomes
platform-dependent in a way it previously was not.

### 9. Hoist tag lowercasing, step-hook filtering, definition lookups

**Impact 5.** Three separate per-step costs. `hasMatchingTags` in
[utils.ts](../cucumber-tsflow/src/runtime/utils.ts) puts `tags.map(tag => tag.toLowerCase())` inside the
predicate handed to `lep.parse`, so the whole array is re-mapped for every token the expression parser
evaluates. In [test-case-runner.ts](../cucumber-tsflow/src/runtime/test-case-runner.ts),
`getBeforeStepHookDefinitions` and `getAfterStepHookDefinitions` re-filter the support library by
`appliesToTestCase(this.pickle)` on every step, and the "after" variant allocates a fresh
`.slice(0).reverse()` each time; `findHookDefinition` rebuilds a concatenated array of all before and
after hook definitions per hook step and then linear-scans it, and `findStepDefinition` linear-scans
`stepDefinitions` per step. Together these scale as steps × definitions, which is real on a large suite
but an order below item 2.

**Complexity 2.** `this.pickle` is fixed for the runner's entire lifetime, so both hook lists are safely
constructor-time values, and the two `find` scans become `Map<id, definition>` indexes built once per run.
Mechanical, contained in two files, and with no behavioural difference to reason about beyond the
identity of the returned arrays.

### 10. Send resolved paths to parallel children instead of re-globbing

**Impact 4.** [worker.ts](../cucumber-tsflow/src/runtime/parallel/worker.ts) calls `resolvePaths` again at
line 81 even though the coordinator already holds the resolved lists and is already sending
`supportCodeCoordinates` in the `INITIALIZE` command, so a `parallel: 8` run performs nine full glob
passes over the project tree instead of one. The rating is held at 4 rather than higher because the
children fork at once and glob concurrently, so the wall-clock saving is roughly one glob's duration plus
the contention, not N globs' worth — the win is real but it is a fixed cost, not a scaling one.

**Complexity 4.** This extends the coordinator-to-child IPC contract in
[adapter.ts](../cucumber-tsflow/src/runtime/parallel/adapter.ts), which is the kind of change that has to
be right in both directions or the child silently loads a different support set than the coordinator
registered. The worker's `resolvePaths` result is also used for more than the support lists, so the
feature-coordinate path has to keep working, and the change needs testing under every transpiler in the
matrix because the CJS and ESM branches consume different fields of it.

### 11. Hoist `shortUuid()`; index the `registerStepBinding` dedupe

**Impact 3.** Two small per-binding allocations. `shortUuid().new()` appears at eight call sites across
[step-decorators.ts](../cucumber-tsflow/src/bindings/step-decorators.ts) and
[hook-decorators.ts](../cucumber-tsflow/src/bindings/hook-decorators.ts), constructing a fresh base58
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

**Impact 3.** `createLogger` in [tsflow-logger.ts](../cucumber-tsflow/src/utils/tsflow-logger.ts) reads
`TSFLOW_VERBOSE` once and early-returns, but the early return is inside the function, so every call site
still allocates its detail object and evaluates its template strings first. Most of that is small garbage
on the hottest loop in the system, which is why this is a 3 rather than a 1 — and one case is worse than
garbage: `loadVue` computes `source?.toString()?.length`, a full buffer-to-string conversion per file,
solely to produce a number that is immediately discarded.

**Complexity 1.** `isVerbose()` is already exported from the same file (and from its `.mjs` twin for the
loaders), so the work is to wrap the hot call sites in the resolve and load hooks and in `transpile`, and
leave the CLI and configuration call sites exactly as they are. There is no behaviour to preserve because
the discarded values are already discarded.

### 13. Delete the hardcoded `cucumber-tsflow-specs` check in `supports()`

**Impact 1.** Zero, and honestly so. The `if (!filename.includes('cucumber-tsflow-specs')) return false;`
guard in [esbuild.mjs](../cucumber-tsflow/src/transpilers/esm/esbuild.mjs)'s exported `supports()` is dead
code — `supports` is exported from both that file and
[esbuild.ts](../cucumber-tsflow/src/transpilers/esbuild.ts) and imported by nothing — so removing it
changes no timing at all. It is on the worklist because it would silently disable transpilation for every
consumer project the moment anyone wired it up, and because the two exported predicates currently
disagree (the CJS version has no such check), which is a trap independent of performance.

**Complexity 1.** A deletion of dead code. The only judgement required is whether to delete both
`supports()` exports outright, given neither has a consumer, or to reconcile them — and either choice is
safe precisely because nothing imports them.

### 14. `module.enableCompileCache()` in the CLI entry

**Impact 4.** Node's compile cache persists V8 bytecode across processes, which attacks parse-and-compile
cost rather than TypeScript-to-JavaScript cost and therefore composes with item 16 rather than overlapping
it. Given the size of the module graph — `@cucumber/cucumber`, the formatter tree, the transpilers, and the
whole support tree in every one of N+1 processes — the ceiling is high. The rating is held to 4 because
the ceiling is unverified in the one configuration that matters: whether sources produced by a custom ESM
loader are cacheable at all is exactly what [analysis-3.md](analysis-3.md) flags as unknown, and if they
are not, the win collapses to the library's own modules.

**Complexity 2.** A few guarded lines at the top of the CLI entry. The `NODE_COMPILE_CACHE` environment variable
arrived in Node 22.1.0 but the programmatic `module.enableCompileCache()` came later, in 22.8.0, and the
package's `engines` floor is `>=22.0.0`, so the guard is a `typeof` check rather than a version branch. The complexity here is not in the code; it is that this item cannot be evaluated
without item 1's instrumentation, which is a sequencing constraint rather than an implementation
difficulty.

### 15. Derive the preload thread count from `availableParallelism()`

**Impact 3.** `Math.min(availableParallelism(), 4)` in
[parallel-loader.ts](../cucumber-tsflow/src/api/parallel-loader.ts) leaves most of a modern CI runner idle
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
[analysis-3.md](analysis-3.md), the `absoluteBaseUrl`, because `rewritePathMappings` bakes absolute
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
little left to parallelise.

**Complexity 7.** It cannot be started before item 16 exists, since the cache is the thing being written.
The substantive difficulty is that evaluating a module naturally pulls in its imports whereas a
transpile-only pass has to discover them, which means an esbuild `metafile` scan over the support entry
points as a replacement for transitive discovery. Against that, transpiling needs no browser globals, so
the change deletes the roughly 160-line `window` shim at the top of
[loader-worker.ts](../cucumber-tsflow/src/api/loader-worker.ts) and removes the hazard of running
module-level side effects N+1 times — a genuine simplification, but one that changes behaviour on the Vue
paths and therefore needs the `*-vue*` workspaces run deliberately.

### 18. Bypass `ts-node` in the esbuild ESM `load` path; async `transform()`

**Impact 7.** On the `es-node-esm` path, `.ts` files are handed to `tsNodeHooks.load()`, so a single
`esbuild.transform` is wrapped in a `ts-node` service, module-type classification, `ts-node`'s resolver
and its source-map plumbing — and that plumbing is a `JSON.parse` plus `JSON.stringify` plus base64
encode per file, appended to the module source so it roughly doubles the string V8 has to allocate and
scan. Removing that is worth real time on its own. The larger half is that it unblocks the async
`transform()` API: `transformSync` posts to an internal `worker_threads` service and blocks on
`Atomics.wait`, so no two files can be in flight at once, and since `require` is synchronous the ESM
loaders are the only path that can ever parallelise transpilation at all.

**Complexity 6.** The `load` hook has to take over everything `ts-node` was contributing — the CJS-versus-ESM
format decision, source-map attachment, and any resolution behaviour consumers have come to rely on — and
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
[run-cucumber.ts](../cucumber-tsflow/src/api/run-cucumber.ts) means pickle parsing and filtering happen
before support code has been evaluated, and support code is what registers parameter types, the snippet
syntax and the `supportCodeIds` the runtime and formatters consume. Establishing which of those the filter
path genuinely needs, and in what order, is the work. Orchestrator reordering is also where subtle
breakage hides: the matrix will catch a hard failure but not a formatter that silently loses definition
metadata.

### 20. Lightweight `bindings` entry point; drop `./cli` from the barrel

**Impact 4.** [index.ts](../cucumber-tsflow/src/index.ts) does `import { default as _Cli } from './cli'`
for the deprecated `Cli` export, so every support file importing a decorator from the package root
transitively pulls in `run-cucumber`, `make-runtime`, the parallel adapter, the Gherkin manager, the whole
`@cucumber/cucumber` formatter tree, `ansis` and `debug` — none of which is needed to evaluate a
decorator. It is a one-time cost per process, but "per process" means the coordinator plus N children plus
every preload thread, and it sits ahead of the first transpile. Capped at 4 because it is a fixed graph
cost rather than a scaling one, and because the new entry point only pays off for consumers who migrate
their imports.

**Complexity 4.** The new entry point needs a matching key in the `exports` map of
[package.json](../cucumber-tsflow/package.json), and following the pattern already there it needs a
hand-written `.mjs` wrapper copied into `lib/` by the build, which puts this in contact with the build
rules in [CLAUDE.md](../CLAUDE.md) rather than just the source. Dropping `./cli` from the root barrel is
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
[analysis-2.md](analysis-2.md).

**Complexity 7.** Synchronous hooks and item 18's async `transform()` pull in opposite directions, and that
conflict has to be resolved deliberately rather than discovered: whichever lands second constrains the
first. The `loadVue` path awaits `nextLoad` and is genuinely asynchronous, so it either stays on
`register()` or needs restructuring. Practically this means supporting both registration mechanisms for a
period, which doubles the surface the matrix has to cover on the four ESM workspaces.

### 22. Concurrent `import()` of support files

**Impact 5.** [support.ts](../cucumber-tsflow/src/api/support.ts) awaits each `import()` to completion —
resolve round trip, load round trip, transform, evaluate — before starting the next, so the loader thread
sits idle between modules and the esbuild service sits idle between transforms. Pipelining that is a
sizeable cold-load win on the ESM paths. It is a 5 rather than a 7 because it overlaps items 16 and 18:
once transpilation is cached or concurrent, what remains serialized is module evaluation, which is
CPU-bound on one thread either way.

**Complexity 6.** Registration order changes, and registration order is load-bearing here in two places:
it determines the order in which ambiguity errors surface, which the `validations` specs assert, and
`isSameStepBinding` deduplication compares callsites in whatever order bindings arrive.
[analysis-3.md](analysis-3.md)'s variant — a concurrent transpile-only warm pass followed by the existing
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
replace N × (resolution + IPC + transform) and let esbuild parallelise internally across cores, which is
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
   complexity is a 4 rather than a 2 purely because the behaviour change wants acknowledging.
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
visible in a stopwatch. They are worth doing while in the neighbouring code — item 13 in particular is a
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

## Phased plan

Each phase ends with a clean `yarn build` and a green `yarn test:all` before the next begins. Phases 6
onward were re-planned after Phase 5; see [Re-rating after Phase 5](#re-rating-after-phase-5).

**Phase 1: items 1, 12, 13 — COMPLETE (2026-09-03).** Instrumentation goes in first so every later phase
has a baseline to be measured against. Item 12 is the same "costs nothing when off" discipline applied to
the same resolve and load call sites, and item 13 is a dead-code deletion in the same file, so all three
touch the loaders once. See [Phase 1 hand-off](#phase-1-hand-off) below for what landed and how to use it.

**Phase 2: items 2, 4, 5, 9, 11 — COMPLETE (2026-09-03).** The in-process runtime and registry hot paths.
Every one is a linear-scan-to-map or a hoist inside `src/runtime` and `src/bindings`, none touches a loader
or an IPC contract, and the spec matrix covers them fully. Item 2 is the dominant win, item 4 insures it,
and 5, 9 and 11 are the same lookup pattern in neighboring files. See
[Phase 2 hand-off](#phase-2-hand-off) below for what landed and the measured effect.

**Phase 3: items 3, 6, 7 — COMPLETE (2026-09-03).** The per-file and per-process costs inside the ESM
`.mjs` loaders and `ts-node` services. A proof-backed deletion plus two caches with `pathResolutionCache`
as precedent; no cross-boundary contract changes, so a failure is a crash rather than a silently wrong
load. See [Phase 3 hand-off](#phase-3-hand-off) below for what landed and the measured effect.

**Phase 4: items 8, 10, 14, 20 — COMPLETE (2026-09-03).** The fixed per-process startup costs: decorator-time
stack walks, the duplicate glob in each child, V8 compile of the module graph, and the size of that graph.
Items 10 and 14 can only be judged with Phase 1's numbers, which now exist, and this is the phase that touches
the package `exports` map and IPC contract, so it is isolated from the pure hot-path work. Item 8 turned out to
be worth far more than its rating: see [Phase 4 hand-off](#phase-4-hand-off) below for what landed, the
`source-map-support`/jsdom finding, and the measured effect.

**Phase 5: items 18, 21 — COMPLETE (2026-09-04).** The ESM hook mechanics. Item 18 wants async `transform()`
and item 21 wants synchronous hooks, so the two have to be settled together, and they must be settled before
Phase 6 builds the cache into the `load` hook it reshapes. The four ESM workspaces are the test. Settled in
favour of synchronous in-thread hooks (`module.registerHooks()`), with item 18's ts-node bypass landed and its
async `transform()` half dropped; see [Phase 5 hand-off](#phase-5-hand-off) below.

**Phase 6: items 26, 28 — COMPLETE (2026-09-16).** Developer experience, open-ended by design. The fixed part is startup feedback: a
TTY-only progress line during support loading (and preload, while it exists) driven from the per-file loops
that already exist in `support.ts` and `loader-worker.ts`, a one-line startup summary, and nothing at all
when stderr is not a TTY or `--quiet`/CI is in effect, so formatter output and report files are untouched.
Item 28 (ESM callsite lines) rides along once the source-map dependency is approved, because it is the
other thing a developer sees first on an ESM suite. Further candidates are listed under item 26 and are
picked as the phase goes. See [Phase 6 hand-off](#phase-6-hand-off) below for what landed, what was left, and the
Phase 7 measurement recipe.

**Phase 7: item 27 plus the `default` profile baseline — COMPLETE (2026-09-17).** One measurement session,
not a code change: CPU-profile the UIS `dim` run and split the 37 s between tsflow, CucumberJS, jsdom/Vue and
consumer steps. Its outcome decides whether a further runtime phase exists and re-orders everything below. In
the same session, take the first `TSFLOW_TIMING` measurement of the `default` profile's startup (about 1380
scenarios, 208 step files), which items 16 and 24 are both priced against and which has never been done. The capture recipe and the
attribution script (`research/scripts/attribute-cpuprofile.js`) are described under
[Notes specific to Phase 7](#notes-specific-to-phase-7). Outcome: tsflow is 0.4% of `runtime:run` on both the
`dim` and the full suite, so no runtime phase follows; the full suite's warm startup is 9.1 s, of which 2.8 s is
transpile work and 5.5 s Node's module loader. See [Phase 7 hand-off](#phase-7-hand-off) below.

**Phase 8: item 16 — COMPLETE (2026-09-17); `parallelLoad` removed, items 15 and 17 dropped (2026-09-17).** The
content-addressed on-disk transpile cache landed behind `--no-transpile-cache`, covering esbuild (CJS and ESM)
and the Vue SFC compile, keyed on source, path, options, tool versions and the tsflow version. Measured on the
UIS full suite in a same-build A/B: `esm:load` 3.05 s → 0.9–1.1 s and `support:import` 6.7 s → 5.1–5.5 s warm,
with all 974 transpiles served from disk in 0.25–0.31 s; on `dim`, 0.6–0.7 s of a 3 s startup. The
`parallelLoad` preload threads now populate the cache the main thread reads, which delivers most of item 17's
payoff and re-rates it down. The `parallelLoad` decision was then measured in the same session — the preload
phase costs 5–6 s on every run and saves at most 1.8 s, cold only — and the owner chose removal: the feature is
gone, the option is accepted and ignored with a loud deprecation notice, and items 15 and 17 are dropped with
it. Item 22 is dropped. See [Phase 8 hand-off](#phase-8-hand-off) and
[`parallelLoad` removal](#parallelload-removal-2026-09-17).

**Phase 9: items 19, 24 — COMPLETE (2026-09-17).** The filtered-run pair: 19 as the precondition for 24,
24 behind `selectiveLoad` (default off) with a full-load fallback. `runCucumber` now parses and filters the
features before loading support code, buffering the Gherkin envelopes until the formatters exist; with the
option on, only the support files whose step patterns the selected steps match are loaded, plus every file
that registered anything but step definitions, every new file and every file whose recorded import graph has
changed. Measured on the UIS full suite; see [Phase 9 hand-off](#phase-9-hand-off).

**Phase 10: item 23 — COMPLETE (2026-09-18).** `--watch`: one resident process that reruns on file changes or
Enter, keeping every module loaded except what must evaluate again (support files that registered something,
changed files and their dependents, decorator-applying helpers). CommonJS is evicted from `require.cache`; ES
modules are re-imported under a `?tsflow=<n>` version query applied by the in-thread resolve hook, the cache-busting
option from the Phase 9 notes, chosen over a resident coordinator with a child per run because only a resident
module graph removes the set-up floor Phase 9 measured. Loaders on the hooks thread fall back to a fresh child
process per run. See [Phase 10 hand-off](#phase-10-hand-off).

**Phase 11: item 25 — CLOSED WITHOUT A PROTOTYPE (2026-09-22).** The bundling prototype was priced before it was
built. Its remaining case after Phases 9 and 10 was the fresh-process full run; on the UIS suite 1596 of the 2564 ES
modules that load are external dependencies a bundle would leave alone and jsdom loads by `require()` outside the
hooks, so the ceiling is 1–3 s of a 241 s CI run, about 1%. The owner closed the item as not worth the highest
complexity on the list; the measurement, the reasoning and the feasibility findings for a future attempt are in
[Phase 11 hand-off](#phase-11-hand-off).

**Phase 12: whole-product review and test build-out — before release.** Not an item from the table. Phases
1–11 landed as eleven increments, each verified by the spec matrix that existed before the work began; nothing
has yet read the result as one product. Phase 12 does that, in three strands that run together rather than in
sequence: the test build-out for the subsystems this branch added (transpile cache, selective loading, watch
mode, module graph, startup progress, timing), the code review proper (patterns to tighten, modules to split or
merge, options and instrumentation that outlived their purpose), and two housekeeping sweeps that are cheapest
done once over the whole tree — the `strictNullChecks` errors the editor reports but the build does not, and
American English spelling in identifiers, comments and documents. Tests and review are one phase, not two:
writing a test is the closest reading a module gets, so the review findings fall out of the test work, and the
tests have to exist before the review's refactors land, not a phase after them. See
[Phase 12 scope](#phase-12-scope) for the strands, the decisions to take, and the exit criteria. The decisions taken at the
start of the phase, the coverage inventory, the review findings list and the split into stages 12a–12f, each with its
own gate and hand-off, are in [Phase 12 baseline](#phase-12-baseline).

## Phase 1 hand-off

Written at the end of the Phase 1 session so that the Phase 2 session can start cold.

### State of the tree

- Work is on branch `2026-09-performance-enhancements`, cut from `master` at `a9f7946` (the merged
  `context-refactor` PR #67). Recent branches in this repo are cut from `master` and merged back through one
  or more PRs, and commit subjects are prefixed with the branch name (`context-refactor shim updates for
workers`). At the time of writing the Phase 1 changes were **uncommitted, pending code review**; check
  `git log` and `git status` before assuming either way.
- `yarn build` and `yarn test:all` were both green on the final Phase 1 build (all sixteen variants, no
  failed scenarios). ESLint is clean on every changed file.
- `origin/Dev-Prebuild` is an unmerged remote branch newer than `master` whose last commit is titled
  "Remove parallel load support". It was not examined. If it is heading to `master`, the preload timing
  sections and item 15/17 lose their subject; worth a look before Phase 6 at the latest.
- The two `.vscode/*` files and the genversion-regenerated `src/version.ts` were already modified before
  Phase 1 began and are unrelated to it.

### What Phase 1 landed

- **Item 1.** New [tsflow-timing.ts](../cucumber-tsflow/src/utils/tsflow-timing.ts) with an `.mjs` twin
  for the ESM loaders. Both share one store per thread on `globalThis.__TSFLOW_TIMING`, the same singleton
  pattern as the registry, so the bundled `esbuild-transpiler-cjs.js` records into the same store as the
  loader that bundled it. Cross-boundary channels: the ESM hooks thread reports over a `MessageChannel` port
  passed as `module.register()` `data` and received by a new `initialize` export on all four loaders;
  preload workers add a `timing` field to their `LOADED` response; parallel children send a new `TIMING`
  IPC message before `READY`, handled in
  [adapter.ts](../cucumber-tsflow/src/runtime/parallel/adapter.ts) via the widened
  `TsFlowWorkerToCoordinatorEvent` union in `runtime/types.ts`. The report prints to stderr from
  `runCucumber()` so both the CLI and the programmatic API get it.
- **Item 12.** Per-file `logger.checkpoint` calls in `loader-utils.mjs`, `esbuild.mjs`,
  `esbuild-transpiler.mjs`, `tsnode-loader.mjs`, `vue-loader.mjs` and `vue-sfc-compiler.ts` are behind a
  module-level `const verbose = isVerbose()`. Module-init and error/warn calls were left alone.
- **Item 13.** Only the `cucumber-tsflow-specs` line was deleted from the ESM `supports()`. The two
  `supports()` exports were not reconciled and still have no consumer.
- Docs: `CHANGELOG.md` has an `[Unreleased]` section, `Architecture.md` has a new "Diagnostics" section
  with the context/scope/channel table, and `README.md` has a short "Startup timing diagnostics" subsection.

### Using `TSFLOW_TIMING` in later phases

```sh
cd cucumber-tsflow-specs/node && TSFLOW_TIMING=true yarn exec cucumber-tsflow -p esnode
```

Every line is prefixed `[tsflow:timing]`, so `2>&1 | grep tsflow:timing` isolates it. Phase names are
identical in every context so the tables aggregate: `bootstrap` (process start to CLI entry, i.e. module
loading), `config`, `preload`, `support:require-modules`, `support:require`, `support:register-loaders`,
`support:import`, `support:finalize`, `registry:update`, `formatters:init`, `gherkin`, `runtime:run`;
the ESM hooks thread adds `esm:hooks-init`, `esm:resolve`, `esm:load`; children add `hooks:before-all`;
preload workers add `registry:descriptors`. Contexts are `main`, `esm-hooks`, `preload:<n>` and
`worker:<id>`, nested as `preload:<n>/esm-hooks`.

Things to know when reading it:

- The `transpile` file column is populated only by esbuild (`transformSync`) and `compileVueSFC`.
  ts-node's TypeScript transpile is not observable, so under the `ts-node` profiles that column is zero and
  the `load` (ESM) and `evaluate` (top-level require/import) columns carry the signal.
- `evaluate` for the _first_ support file in each context includes transpiler warm-up and the shared
  dependency graph (`lib/index.js`, `@cucumber/cucumber`, …), which is why one file per context dominates
  that column. That is a real cost, not a bug in the table.
- `calls` on the `support:*` phases in the `node` CJS profile is 8, not 1, because the `@reload` scenarios
  call `loadSupport`/`reloadSupport` repeatedly inside the run. Read `calls` before comparing `ms`.
- The spec suites are tiny (15–31 scenarios, under a dozen support files), so they validate the report's
  shape, not the ratings in this document. The large real-world testbed is the UIS Tools VueApp, wired in
  with the project skill `pnpm-link-consumer` (see `.claude/skills/`). Phase 2's item 2 figures in
  particular can only be reproduced at hundreds of scenarios.

### Notes specific to Phase 2

- Phase 2's wins are runtime and registration hot paths, so they show up as a drop in `runtime:run`
  (items 2, 4, 9), `registry:update` (item 5) and `support:require`/`support:import` (item 11, since
  decorator registration happens at load time). There is no per-step or per-binding breakdown in the
  report; if one is needed, add a phase with `startTimer()`/`recordPhase()` rather than a new mechanism.
- Take a `TSFLOW_TIMING` baseline on the large suite _before_ touching item 2, once per profile you care
  about, and keep the output. Nothing in the spec matrix will show the difference.
- Item 2 changes behaviour, not just speed: today `getStepScenarioContext` can resolve to a _different_
  scenario's context when a step pattern matches text in another pickle. Any support code that has come to
  depend on that accident will change behaviour. Say so in the changelog.
- None of the Phase 2 items touch a loader, the `.mjs` files, or an IPC contract, so the Phase 1 timing
  plumbing should not need to change. If it does, the `.ts` and `.mjs` twins must be edited together.
- Build with `yarn build`, never bare `tsc`; run `yarn test:all` before calling the phase done; both
  decorator modes must keep working (the `*-exp*` workspaces catch regressions).

## Phase 2 hand-off

Written at the end of the Phase 2 session so that the Phase 3 session can start cold.

### State of the tree

- Still on branch `2026-09-performance-enhancements`. Phase 1 was committed as `cfcf8c0` ("Timing add +
  isVerbose updates"). At the time of writing the Phase 2 changes were **uncommitted, pending code review**;
  check `git log` and `git status` before assuming either way.
- `yarn build` clean, no stray `.js` under `src/`; `yarn test:all` green on all sixteen variants; ESLint and
  Prettier clean on every changed file; `tsc --noEmit` clean.
- Files changed: `src/runtime/message-collector.ts`, `src/runtime/utils.ts`, `src/runtime/test-case-runner.ts`,
  `src/bindings/binding-registry.ts`, `src/bindings/binding-decorator.ts`, `src/bindings/step-decorators.ts`,
  `src/bindings/hook-decorators.ts`, plus `CHANGELOG.md` and one line in `Architecture.md`.

### What Phase 2 landed

- **Item 2.** `MessageCollector` gained a `currentScenarioContext` field, set in `startTestCase` and cleared
  in `endTestCase` and `reset`. `getStepScenarioContext()` now takes no argument and returns that field; the
  pickle scan, its `hasMatchingStep`/`hasMatchingTags` calls and the `stepHasTags` helper are gone. Both
  call sites (`test-case-runner.ts` and the step wrapper in `binding-decorator.ts`) were updated. The
  behaviour change is recorded in the changelog: steps always get the running scenario's context, and the
  tag-scoped binding is still chosen from the registry via `getStepBindings`.
- **Item 4.** `hasMatchingStep` memoizes compiled `RegExp`s in a module-level `Map` keyed by step text.
  Only successful compiles are cached, so an invalid pattern still logs on every call as before. The
  surviving callers are the two in `gherkin-manager.ts` (`--debug-file` path only).
- **Item 5.** `updateSupportCodeLibrary` builds one `Map<cucumberKey, definition>` per definition array
  (the step-definition index is shared by given/when/then) and keeps the first definition per key, matching
  the previous `find` semantics exactly.
- **Item 9.** `hasMatchingTags` lower-cases the tag array once per call. `TestCaseRunner` computes the
  before/after step-hook lists in its constructor (`getBeforeStepHookDefinitions` /
  `getAfterStepHookDefinitions` now return those cached arrays), and resolves hook and step definitions
  through a `DefinitionIndex` (`hooksById`, `stepsById`) held in a module-level `WeakMap` keyed on the
  `SupportCodeLibrary` object. A library is a fresh object from every `finalize()` and its arrays are never
  mutated afterwards, so the index is built once per library, not once per test case; a reload gets a new
  library and therefore a new index.
- **Item 11.** Both decorator files hoist `shortUuid()` to a module-level `uuidTranslator`. In
  `registerStepBinding` the inner `isSameStepBinding` was replaced by a module-level `stepBindingKey()` that
  reproduces the two comparison rules (hooks add binding type and method name) as a string key.
  `ClassBinding` gained a `stepBindingKeys: Set<string>` so the per-class dedupe is a set lookup;
  `removeBindingsForFile` rebuilds the set after filtering. The per pattern-and-tag group still uses
  `Array.some` with the same key because a group normally holds one binding, so an index there would not pay
  for itself.

### Measured effect on the large suite

UIS Tools `dim` profile (324 scenarios, 1363 steps, `es-vue-esm`, experimental decorators, serial),
`TSFLOW_TIMING=true`, two runs per build, same machine and session. Both builds produced the same five
failures, all `SyntaxError: 'div.ml-,,,B2px,,,D .p-chip' is not a valid selector` from `nwsapi` — a
consumer-side Tailwind arbitrary-value class hitting jsdom, present before and after, not a tsflow
regression.

| Build               | Run | `runtime:run` ms | "executing steps" | `support:import` ms | `bootstrap` ms | Wall  |
| ------------------- | --- | ---------------- | ----------------- | ------------------- | -------------- | ----- |
| Phase 1 (`cfcf8c0`) | 1   | 47015            | 44.2 s            | 138248              | 17444          | 235 s |
| Phase 1 (`cfcf8c0`) | 2   | 54850            | 51.7 s            | 142104              | 27278          | 235 s |
| Phase 2             | 1   | 49925            | 49.1 s            | 54013               | 676            | 108 s |
| Phase 2             | 2   | 48616            | 47.8 s            | 26162               | 469            | 77 s  |

Two conclusions, and the first matters for how the rest of this document is read:

1. **`runtime:run` did not move.** The before runs span 47–55 s and the after runs 49–50 s, so the change to
   step execution is inside run-to-run noise at this suite size. Item 2 was rated impact 10 on the strength
   of measured figures (8.5 s at 200 scenarios, 51.9 s at 500) that this suite does not reproduce. Working
   backwards, the old scan at 324 pickles cost a few milliseconds per step, not tens, and the ~48 s of step
   time here is the Vue component mounting the steps actually do. The O(1) lookup is still correct, still
   removes a superlinear term that would matter at several thousand scenarios, and fixes a real
   cross-scenario resolution bug — but it did not recover seconds on this suite, and the `default` profile
   (~1380 scenarios) has not been measured. Doing that comparison (rebuild `cfcf8c0`, run `test` twice,
   rebuild HEAD, run twice) is the obvious next measurement, and the same skepticism should be applied to
   any other item whose rating rests on numbers from outside this testbed.
1. **The wall-clock drop is not Phase 2.** `bootstrap` (27 s → 0.5 s) and `support:import` (142 s → 26 s)
   are module loading and file transpilation, which Phase 2 does not touch. The baseline runs were the first
   two runs after a fresh `yarn build` had rewritten `lib/`, and on this Windows machine that pays cold
   filesystem cache plus on-access antivirus scanning for longer than one warm-up run. Discard the wall
   figures; the phase columns are the comparison. Take at least three runs per build in later phases.

`registry:update` went from 2–5 ms to 0.6 ms (item 5) — real, but immaterial at this binding count.

### Notes specific to Phase 3

- Nothing in Phase 2 touched the loaders, the `.mjs` files, or an IPC contract, so the Phase 1 timing
  plumbing is unchanged and the `esm:*` phases and file tables are directly comparable across phases.
- Phase 3 is where the numbers above say the time actually is: `support:import` at 26–142 s and `esm:load`
  at ~35 s for 921 files (both runs) dwarf everything else in the report. Item 3 (`files: true`) shows up as
  `esm:hooks-init` and per-process start; items 6 and 7 as `esm:resolve` (5 s over 2828 calls here).
- The `dim-*.log` files with the full reports were written to the session scratchpad and are not preserved;
  the table above is the record.

## Phase 3 hand-off

Written at the end of the Phase 3 session so that the Phase 4 session can start cold.

### State of the tree

- Still on branch `2026-09-performance-enhancements`. Phase 2 was committed as `8f0a161` ("MessageCollector
  updates + Map additions"). At the time of writing the Phase 3 changes were **uncommitted, pending code
  review**; check `git log` and `git status` before assuming either way.
- `yarn build` clean, no stray `.js` under `src/`; `yarn test:all` green on all sixteen variants; Prettier
  and ESLint clean on every changed `.mjs` file. No `.ts` source changed, so `tsc --noEmit` is unaffected.
- Files changed: `src/transpilers/esm/loader-utils.mjs`, `src/transpilers/esm/esbuild.mjs`,
  `src/transpilers/esm/tsnode-loader.mjs`, `src/transpilers/esm/tsnode-service.mjs`,
  `src/transpilers/esm/vue-loader.mjs`, `src/transpilers/esm/README.md`, plus `CHANGELOG.md` and a new
  "ESM loader caches" subsection in `Architecture.md`.
- The UIS Tools VueApp was already linked to this checkout (`link:` devDependency, see the
  `pnpm-link-consumer` skill) when the session started; nothing about the link was changed.

### What Phase 3 landed

- **Item 3.** The two `ts-node` services tsflow creates (`tsnode-loader.mjs` for `ts-node-esm`,
  `tsnode-service.mjs` for `es-node-esm` and `es-vue-esm`) now pass `files: false` rather than merely
  dropping `files: true`. The reason is precedence: ts-node resolves `files` as API option → tsconfig
  `ts-node.files` → `TS_NODE_FILES`, and every spec workspace tsconfig (and the ESM README's recommended
  tsconfig) sets `ts-node.files: true`, so a plain removal would have left the walk in place for exactly the
  consumers who followed the docs. `files: false` is safe because `transpileOnly: true` is forced in the same
  option object and the walk's only consumer, `config.fileNames` at `ts-node-maintained/dist/index.js:368`,
  is inside `if (!transpileOnly)` — re-verified against the installed 10.9.x this session.
  The two `process.env.TS_NODE_FILES` assignments were deleted as dead code: both ran after
  `ts-node-maintained` had already been required at module init (`tsnode-service.mjs` requires it at top
  level and `loader-utils.mjs` imports `tsnode-service.mjs`), and ts-node reads its env defaults once at
  require time. `ts-vue-esm` (`vue-loader.mjs` → `ts-node-maintained/esm`) takes no API options, does not
  force `transpileOnly`, and may legitimately type-check `.vue` shims, so it is left governed by the
  consumer's tsconfig; the README says so.
- **Item 6.** `esbuild.mjs` compiles `{ searchPattern, replacementPath, regex }` per alias once inside
  `loadTsConfigPaths()` (stored as `tsconfigCache.mappings`); `tsnode-loader.mjs` builds the equivalent
  module-level `pathMappings` array. The `searchRegex.test(code)` pre-scan in `tsnode-loader` is gone; the
  single `replace` pass detects and rewrites, and `replacementCount > 0` replaces the old `modified` flag.
  Reusing a `g`-flagged `RegExp` with `String.prototype.replace` is safe because `@@replace` resets
  `lastIndex` to 0 for global regexes; the `.test()` call was the only thing that made reuse hazardous.
- **Item 7.** `resolveWithExtensions` caches in `extensionResolutionCache`, keyed on the resolved absolute
  extensionless path (plus the extension list when a non-default one is passed — no caller does today)
  rather than on `specifier + parentURL`. That key is strictly better: `../fixtures/x` from ten files in one
  directory and `@fixtures/x` mapped to the same location all share one set of probes. Negative results are
  cached. Lifetime is the process; `clearResolutionCaches()` is exported and clears both this and
  `pathResolutionCache`, which is the documented hook item 23's watch mode needs. `resolveSpecifier` gained
  a `getTsNodeHooks` thunk option alongside the existing `tsNodeHooks` value; `createEsbuildLoader` passes
  the thunk, so ts-node service construction happens on the first `.ts`/`.tsx` specifier or load, not on
  the first `resolve` of any specifier. `tsnode-loader.mjs` still passes its eager `esmHooks` value.

### Measured effect on the large suite

UIS Tools `dim` profile (324 scenarios, 1363 steps, `es-vue-esm`, experimental decorators, serial),
`TSFLOW_TIMING=true`, same machine and session. This time the comparison is a true A/B: the Phase 3 build was
run three times, then the five loader files were stashed, `lib/` rebuilt from the Phase 2 loaders, that
build run three times, and the Phase 3 tree restored and rebuilt. Both builds produced the same five
`nwsapi` selector failures as in Phase 2. Run 1 of the Phase 3 set was the first run after a `yarn build`
and is shown only to make the cold-cache effect visible; the baseline set ran with a warm cache throughout
because its `yarn build` was preceded by the Phase 3 runs over the same dependency tree.

| Build              | Run | `support:import` ms | `esm:resolve` ms (2828 calls) | `esm:load` ms (921 files) | `esm:hooks-init` ms | `bootstrap` ms | Wall  |
| ------------------ | --- | ------------------- | ----------------------------- | ------------------------- | ------------------- | -------------- | ----- |
| Phase 2 loaders    | 1   | 25383               | 1128                          | 1308                      | 158                 | 468            | 73 s  |
| Phase 2 loaders    | 2   | 25351               | 1079                          | 1329                      | 142                 | 452            | 71 s  |
| Phase 2 loaders    | 3   | 24089               | 986                           | 1190                      | 142                 | 475            | 71 s  |
| Phase 3 (cold)     | 1   | 88829               | 4134                          | 29235                     | 860                 | 688            | 138 s |
| Phase 3            | 2   | 23533               | 973                           | 1186                      | 141                 | 516            | 71 s  |
| Phase 3            | 3   | 23859               | 997                           | 1192                      | 128                 | 467            | 75 s  |

`runtime:run` was 39.1–40.7 s on every warm run of both builds and is omitted.

Three conclusions:

1. **Phase 3 is worth about a second on this suite, not the tens of seconds the ratings implied.**
   Warm `support:import` moved from 24.1–25.4 s to 23.5–23.9 s, `esm:resolve` from 0.99–1.13 s to
   0.97–1.00 s, and `esm:hooks-init` from 142–158 ms to 128–141 ms. All three are real and in the expected
   direction, and all three are small. The extension cache (item 7) cannot save much when a warm OS file
   cache answers `existsSync` in microseconds; the win it was rated for is a cold-cache or network-drive
   win. The path-mapping regexes (item 6) are a handful of aliases here. The `files: false` change (item 3)
   could not show up on this testbed at all: the UIS `test/tsconfig.json` has no `ts-node` block, so
   `files` was already unset and no `include` walk was being paid. Item 3 pays off only for consumers whose
   tsconfig sets `ts-node.files: true`, which is what every spec workspace and the ESM README's
   recommended tsconfig do; measuring it needs such a consumer, and the `include` set's size decides the
   prize.
1. **The Phase 2 hand-off's `esm:resolve` 5 s and `esm:load` 35 s figures were cold-cache artifacts.**
   The same Phase 2 loaders, warm, measure 1.0 s and 1.3 s. The Phase 3 cold run reproduces the shape
   exactly (4.1 s and 29.2 s), so those numbers describe the first run after `yarn build` rewrote `lib/`
   and nothing about the code. This also corrects the "Notes specific to Phase 3" bullet above that said
   the time "actually is" in `esm:load`; on a warm run it is in `evaluate` (module execution, 24–26 s of
   the 24–25 s `support:import`), which no loader-level change can touch.
1. **`esm:load` is a sum over concurrent hook invocations, not elapsed time.** Node loads sibling imports
   concurrently, so summed `load` durations can exceed the phase that contains them (29 s inside an 89 s
   import is fine; on Phase 2's record 35 s inside a 26 s import was the giveaway). Compare it across
   builds, never against wall clock.

Working backwards from these figures, the remaining startup cost on this suite is module evaluation of
~200 support files plus their dependency graph (`evaluate` 24–26 s) and the 0.5 s `bootstrap`. Of the
Phase 4 items, 8 (lazy callsites at decorator time) and 20 (a smaller import graph) act on `evaluate`; 14
acts on both. Item 16's transpile cache does not help a warm run of this profile at all — `transpile ms`
is under 1 s of the 24 s — and its rating should be reread with that in mind before Phase 6 is scoped.

_Corrected by Phase 4:_ the "module evaluation" reading of `evaluate` was wrong. About 20 s of the 24–26 s
was `source-map-support` resolving decorator callsites, one synchronous jsdom `XMLHttpRequest` (a spawned
process) per support file. Genuine module evaluation of this profile is about 4 s. See the Phase 4 hand-off.

### Notes specific to Phase 4

- Phase 4 (items 8, 10, 14, 20) is the first phase to touch `.ts` files again after two phases in
  `src/runtime`, `src/bindings` and `.mjs` loaders, and the first to touch the package `exports` map and the
  coordinator-to-child IPC contract. The Phase 1 timing plumbing was not changed in Phase 3, so `esm:*`
  phases and the file tables remain directly comparable across all three phases.
- Item 8 (lazy callsites) shows up in the `evaluate`/`import` file columns and `support:import`, item 10
  (no child re-glob) in per-`worker:<id>` `config`/startup, item 14 (`enableCompileCache`) in `bootstrap`
  across every context, item 20 (barrel slimming) in `bootstrap` and the first-file `evaluate` outlier.
- The `dim` profile is serial (`parallel` unset), so item 10 cannot be measured on it; the UIS `test`
  profile or a spec workspace with `parallel: 2` is needed for that one.
- Take at least three runs per build and discard run one after any `yarn build` or `pnpm install`; the
  Phase 2 hand-off explains why (cold filesystem cache plus on-access antivirus on this Windows machine).

## Phase 4 hand-off

Written at the end of the Phase 4 session so that the Phase 5 session can start cold.

### State of the tree

- Still on branch `2026-09-performance-enhancements`. Phase 3 was committed as `975cedd` ("ESM Loader
  caches"). At the time of writing the Phase 4 changes were **uncommitted, pending code review**; check
  `git log` and `git status` before assuming either way.
- `yarn build` clean, no stray `.js` under `src/`; `yarn test:all` green on all sixteen variants on the
  build before the jsdom fix below and again on the final build. ESLint and Prettier clean on every changed
  file; `tsc --noEmit` on the spec workspaces (`node`, `node-esm`) resolves the new entry point's types.
- Files changed: `src/utils/our-callsite.ts` (rewritten), `src/bindings/binding-registry.ts`
  (`stepBindingKey`), `src/bindings/binding-decorator.ts` (imports), `src/index.ts` (root barrel),
  `src/runtime/types.ts`, `src/runtime/make-runtime.ts`, `src/runtime/parallel/adapter.ts`,
  `src/runtime/parallel/worker.ts`, `src/api/run-cucumber.ts`, `bin/cucumber-tsflow.js` and
  `bin/cucumber-tsflow` (identical), `package.json` (`exports`, `files`). New: `src/bindings.ts`,
  `src/bindings.mjs`, `bindings/index.d.ts`. One spec file per workspace
  (`src/step_definitions/basic-test.ts`, all eight) imports from `@lynxwall/cucumber-tsflow/bindings` so the
  entry point is exercised in every variant. Plus `CHANGELOG.md`, `Architecture.md` (Registration Flow,
  Registry Internals, Parallel Execution, CLI, Package Exports) and `README.md` (Bindings, Compile cache).
- The UIS Tools VueApp link (`pnpm-link-consumer` skill) was in place throughout and was not changed.

### What Phase 4 landed

- **Item 8.** `Callsite.capture()` now stores only the raw V8 frame, taken with `Error.stackTraceLimit`
  lowered to the three frames needed (`capture`, the decorator factory, the support file) and
  `Error.prepareStackTrace` swapped and restored around one `new Error()`. `filename`/`lineNumber` are
  getters that run `sourceMapSupport.wrapCallSite` on first read and memoize; `rawPosition`
  (`file:line:column` of the executed code) is free. `stepBindingKey` in the registry keys on
  `rawPosition` instead of the mapped file and line, so `registerStepBinding` never resolves. The first
  resolution therefore happens in `updateSupportCodeLibrary`, after all support code has loaded — that is
  where the cost moved, and where the finding below was made. The cwd-stripping now uses `path.sep`, so
  Linux/macOS `uri`s become cwd-relative like Windows ones (the one behaviour change; CI is Linux and the
  spec features do not assert on `uri`). Reported `uri`/`line` values on Windows are byte-identical before
  and after in nine of the ten spec reports; the tenth (`esvue.html`) differs only because `vue-esm` and
  `vue-exp-esm` both write that filename and a different profile was the last writer — a pre-existing spec
  config collision, not a behaviour change. Microbenchmark, plain Node, 30-deep stack: old capture
  21.5 µs, new capture 6.0 µs, deferred resolve 6.1 µs per binding.
- **The jsdom finding (unplanned, item 8's real payoff).** Once resolution was deferred, `registry:update`
  on the UIS `dim` profile measured 20 s where Phase 2 had measured 0.6 ms, and `support:import` dropped
  by the same 20 s. The cause: `source-map-support` (`isInBrowser()`) treats a process with `window` and
  `XMLHttpRequest` globals — which every jsdom set-up creates, including our own `vue-jsdom-setup.mjs` —
  as a browser, and `retrieveSourceMapURL` then issues a **synchronous `XMLHttpRequest`** for each source
  file before falling back to `fs` anyway. jsdom services a sync XHR by spawning a process. Reproduced in
  isolation: 0.3 ms per file without jsdom globals, 680 ms per file with them; the `dim` profile has 34
  step files, so ~20 s. This has been happening on every Vue/ESM consumer run since decorators first
  captured callsites, and the Phase 3 hand-off misread it as module evaluation. In CJS mode it does not
  occur because ts-node redirects `require('source-map-support')` to its own `@cspotcode` copy installed
  with `environment: 'node'`. Fix: `withoutBrowserDetection()` in `our-callsite.ts` deletes the
  `XMLHttpRequest` global for the duration of the synchronous `wrapCallSite` call when both globals are
  present and the property is configurable, and restores it in `finally`. It mutates no library state and
  behaves identically for consumers whose ESM support files do carry source maps. Calling
  `sourceMapSupport.install({ environment: 'node' })` was rejected because `install()` also sets
  `Error.prepareStackTrace` and a one-shot `errorFormatterInstalled` flag that would silence a consumer's
  own later `install()`.
- **Item 10.** `InitializeTsflowCommand` gained `resolvedSupportPaths: Pick<IResolvedPaths, 'requirePaths' |
  'importPaths'>`; `runCucumber` passes its already-resolved lists through `makeRuntime` →
  `ChildProcessAdapter` → `INITIALIZE`, and `ChildProcessWorker.initialize` uses them instead of calling
  `resolvePaths` (its `logger` and `resolvePaths` imports are gone). `IMessageData.coordinates` is still
  sent and now unused by the worker; left alone. Measured directly against the UIS `test/` tree with
  cucumber's `resolvePaths`: 2–9 ms warm for the `dim` (34 files) and `default` (209 files, 206 features)
  profiles alike. The saving per child is real but single-digit milliseconds on a warm cache; the rating of
  4 was too high for this machine and is a cold-cache/network-drive number.
- **Item 14.** `bin/cucumber-tsflow.js` calls `module.enableCompileCache()` (guarded by `typeof`) before
  requiring `lib/cli/run.js` and, if Node returned a directory and `NODE_COMPILE_CACHE` is unset, exports
  that directory as `NODE_COMPILE_CACHE`. That export matters: `enableCompileCache()` does **not** set the
  variable itself (verified on Node 24.16), so without it forked children and preload worker threads would
  start without the cache. `NODE_DISABLE_COMPILE_CACHE=1` and `NODE_COMPILE_CACHE=<dir>` are honoured by
  Node. **Measured neutral** on the UIS `dim` profile — see the table; `bootstrap` 397–438 ms with the
  cache versus 397–402 ms without, wall clock identical within noise. Sources produced by the ESM loader
  hooks are evidently cached or not without visible effect either way. Whether to keep it is a review
  decision: it costs nothing measurable and may help cold CI starts or CJS suites, neither of which was
  measured here; if it is dropped, the README "Compile cache" section, the CHANGELOG entry and the
  Architecture CLI paragraph go with it.
- **Item 20.** New `@lynxwall/cucumber-tsflow/bindings` (`src/bindings.ts` + `src/bindings.mjs`, copied to
  `lib/` by the existing `copy:root-mjs` step; `exports["./bindings"]` with `types`/`import`/`require`;
  `bindings/index.d.ts` stub mirroring `api/index.d.ts`; `files` updated). It exports the decorators, the
  context classes and the CucumberJS support-code helpers; the root barrel does `export * from './bindings'`
  and adds the formatters, snippet syntax, `version` and `Cli`. `Cli` is now a `deprecate()`-wrapped
  function that `require`s `./cli` on first construction, so importing the root no longer loads the CLI
  (`new Cli(...).run()` unchanged; `instanceof Cli` no longer meaningful — noted in the CHANGELOG).
  `binding-decorator.ts` takes `Given`/`Before`/… from `supportCodeLibraryBuilder.methods` instead of the
  `@cucumber/cucumber` root barrel, which alone was 456 modules. Warm module counts / load time on Node 24:
  root before 593 / 550 ms, root after 540 / 480 ms, `bindings` 239 / 210–350 ms. The `.mjs` wrappers export
  `ScenarioContext`, `StartTestCaseInfo` and `EndTestCaseInfo` as `undefined` because they are interfaces;
  the pre-existing `wrapper.mjs` does the same, so parity was kept. UIS step files still import the root, so
  only the lazy `Cli` part of this item is in the UIS numbers.

### Measured effect on the large suite

UIS Tools `dim` profile (324 scenarios, 1363 steps, `es-vue-esm`, experimental decorators, serial),
`TSFLOW_TIMING=true`, same machine and session, all runs green. Three builds: **Phase 3** (the committed
`975cedd` loaders, obtained by stashing the Phase 4 tree and rebuilding), **Phase 4 (lazy only)** —
everything above except the jsdom fix, which is what exposed the finding — and **Phase 4 (final)** with the
fix. Run 1 after each `yarn build` is omitted (cold cache: 128–219 s). `NODE_DISABLE_COMPILE_CACHE=1` rows
isolate item 14.

| Build                    | Run | `support:import` ms | `registry:update` ms | startup (import + update) | `bootstrap` ms | `esm:resolve` ms | `esm:load` ms | `runtime:run` ms | Wall  |
| ------------------------ | --- | ------------------- | -------------------- | ------------------------- | -------------- | ---------------- | ------------- | ---------------- | ----- |
| Phase 3                  | 2   | 25807               | 0.4                  | 25.8 s                    | 445            | 1403             | 1449          | 43535            | 77 s  |
| Phase 3                  | 3   | 24212               | 0.9                  | 24.2 s                    | 422            | 1221             | 1325          | 59214            | 91 s  |
| Phase 3                  | 4   | 29131               | 0.8                  | 29.1 s                    | 437            | 1986             | 2307          | 86368            | 124 s |
| Phase 4 lazy, cache      | 2   | 4807                | 20803                | 25.6 s                    | 446            | 1386             | 1276          | 49320            | 83 s  |
| Phase 4 lazy, cache      | 3   | 4980                | 20012                | 25.0 s                    | 455            | 1441             | 1258          | 50432            | 83 s  |
| Phase 4 lazy, cache      | 4   | 4836                | 19815                | 24.7 s                    | 438            | 1279             | 1267          | 49845            | 83 s  |
| Phase 4 lazy, no cache   | 1   | 4674                | 20925                | 25.6 s                    | 453            | 1294             | 1301          | 46769            | 84 s  |
| Phase 4 lazy, no cache   | 2   | 4898                | 20711                | 25.6 s                    | 442            | 1482             | 1391          | 53102            | 89 s  |
| Phase 4 lazy, no cache   | 3   | 5115                | 21247                | 26.4 s                    | 511            | 1389             | 1474          | 51851            | 92 s  |
| Phase 4 final, cache     | 2   | 3749                | 9.3                  | 3.8 s                     | 405            | 1037             | 1005          | 45734            | 56 s  |
| Phase 4 final, cache     | 3   | 3954                | 13                   | 4.0 s                     | 397            | 1040             | 1046          | 45652            | 56 s  |
| Phase 4 final, cache     | 4   | 3781                | 12                   | 3.8 s                     | 438            | 1048             | 1027          | 45158            | 57 s  |
| Phase 4 final, no cache  | 1   | 3965                | 12                   | 4.0 s                     | 397            | 1099             | 1201          | 45137            | 56 s  |
| Phase 4 final, no cache  | 2   | 4564                | 19                   | 4.6 s                     | 399            | 1271             | 1276          | 46528            | 58 s  |
| Phase 4 final, no cache  | 3   | 4226                | 10                   | 4.2 s                     | 402            | 1175             | 1247          | 48886            | 61 s  |

Conclusions:

1. **Startup on this profile went from 24–29 s to 3.8–4.6 s, and wall clock from 77 s (best baseline run)
   to 56–58 s.** All of it is the jsdom finding. The "lazy only" rows prove the attribution: the 20 s left
   `support:import` and reappeared, to the millisecond, in `registry:update`, where the deferred
   `wrapCallSite` calls now run; the final rows remove it. Genuine module evaluation of the 34 step files
   and their component graph is the ~4 s that remains, of which `test-setup.mjs` is about 0.8 s.
1. **`runtime:run` is not comparable in this session.** The Phase 3 baseline itself ranged 43.5–86.4 s over
   three warm runs (35 VS Code processes and on-access antivirus were active; Phase 3's own session measured
   39–41 s). Nothing in Phase 4 touches the per-step path, and the final build's 45.1–48.9 s sits inside the
   baseline's range. Do not read the 83 s "lazy only" wall clocks as a regression either; their
   `runtime:run` spread is the same noise.
1. **The compile cache is neutral here.** `bootstrap` and wall clock are indistinguishable with and
   without it, in both the lazy-only and final builds.
1. **Items 6/7 from Phase 3 read a little better on the final build** (`esm:resolve` 1.04–1.27 s,
   `esm:load` 1.0–1.3 s) but the baseline rows in this session are noisier than Phase 3's, so treat that
   as unchanged.

### Notes specific to Phase 5

- **ESM callsites have always been raw positions.** In every ESM variant the frame's file is a `file://`
  URL and no source map is found for it (the `.ts` on disk has no `sourceMappingURL`; the transpiled output
  with its inline map lives on the loader-hooks thread), so `uri` is the URL and `line` is the compiled
  line — verified against the spec reports (TS line 50 reported as 53 under esbuild, 52 as 55 under
  ts-node). CJS gets mapped TS lines via ts-node's redirected `source-map-support`. Making ESM correct
  means getting the inline map from the hooks thread to the main thread (the Phase 1 timing plumbing
  already has a `MessageChannel` between them) or using `module.findSourceMap()` with source maps enabled.
  That is Phase 5 territory because item 18/21 decide where the transpiled output lives; it is a
  correctness item, not a performance one, and it is unrated on the worklist.
- With the jsdom cost gone, the remaining warm startup on the `dim` profile is ~4 s of real module
  evaluation plus ~1 s each of `esm:resolve` and `esm:load`, 0.4 s `bootstrap`. Item 16 (transpile cache)
  attacks `transpile ms`, which is under 1 s here; Phase 6's scope should be re-read against these numbers.
  Consumers whose suites are large and non-jsdom were never paying the 20 s and will see only the small
  wins.
- The spec `cucumber.json` files in `vue-esm` and `vue-exp-esm` both write `../reports/esvue.*`, and
  `node-exp`'s `es-node-esm` profile writes `tsnode-exp.*`; whichever runs last wins. Harmless for pass/fail
  but it defeats before/after report diffing for those variants. Not fixed (out of scope).
- Nothing in Phase 4 changed a loader or the `.mjs` files; the Phase 1 timing plumbing is unchanged, so
  `esm:*` phases and file tables remain comparable across all four phases. The IPC contract changed
  (`INITIALIZE` gained `resolvedSupportPaths`); coordinator and child are always the same build so no
  compatibility shim was added.
- Prettier's `endOfLine: crlf` applies to everything under `cucumber-tsflow/src`; files written by tooling
  with LF need `prettier --write` before the diff is clean, and `Architecture.md` is CRLF on disk too.
- Build with `yarn build`, never bare `tsc`; run `yarn test:all` before calling the phase done; take at
  least three runs per build on the UIS profile and discard run one.

## Phase 5 hand-off

Written at the end of the Phase 5 session so that the Phase 6 session can start cold.

### State of the tree

- Still on branch `2026-09-performance-enhancements`. Phase 4 was committed as `b2e9383` ("phase 4: lazy
  callsites, soure mapping") and the core of Phase 5 as `abf6b0d` ("update esm hook mechanics"). The
  follow-up removal of `esbuild-transpiler.mjs`, its build script and `exports` entry (see item 18 below)
  and the `research/` directory were **uncommitted** at the time of writing; check `git log` and
  `git status` before assuming either way.
- `yarn build` clean, no stray `.js` under `src/`; `yarn test:all` green on all sixteen variants. In addition,
  because this phase adds a second registration mechanism, two things the matrix does not cover were run by
  hand and were green: `TSFLOW_ESM_HOOKS=async yarn test:esm` (the four ESM variants on the `module.register()`
  fallback with the rewritten hooks) and `cucumber-tsflow -p esnodeesm --parallel 2` / `-p esvue-esm --parallel 2`
  in `node-esm` and `vue-esm` (in-thread hooks inside parallel child processes; every esbuild ESM spec profile
  is serial). ESLint and Prettier clean on every changed file.
- Files changed: new `src/api/register-loaders.ts`; `src/api/support.ts`, `src/api/loader-worker.ts` and
  `src/runtime/parallel/worker.ts` now call `registerLoader()` instead of `register()` directly;
  `src/transpilers/esm/loader-utils.mjs` (rewritten, all helpers synchronous, ts-node removed),
  `esnode-loader.mjs`, `esvue-loader.mjs` (export `resolve`/`load`/`initialize` only), `tsnode-loader.mjs`
  and `vue-loader.mjs` (adapted to the synchronous helpers, otherwise unchanged and still on `register()`);
  `src/transpilers/esm/tsnode-service.mjs`, `src/transpilers/esm/esbuild-transpiler.mjs` and
  `src/scripts/build-esm-transpiler-cjs.js` deleted, with the matching `exports` entry and `build:transpiler`
  script removed from `package.json`; `src/utils/tsflow-timing.ts` / `.mjs` header comments; build notes in
  `CLAUDE.md`, `.github/copilot-instructions.md` and the `pnpm-link-consumer` skill. Docs:
  `CHANGELOG.md` (three earlier `[Unreleased]` entries about the esbuild loaders' ts-node service were
  rewritten rather than contradicted, since nothing has shipped), `Architecture.md` (Diagnostics table,
  Transpilers, new "ESM loader registration", "ESM loader caches"), `README.md` (new "ESM loader hooks"),
  `src/transpilers/esm/README.md`.
- The UIS Tools VueApp link (`pnpm-link-consumer` skill) was in place throughout and was not changed.

### What Phase 5 landed

- **The 18/21 decision.** Synchronous hooks won. `module.registerHooks()` removes a `postMessage` round trip
  per `resolve` and per `load` and a structured clone per load result for _every_ module the thread imports,
  support files and dependency graph alike; item 18's async `esbuild.transform()` could only have overlapped
  the esbuild calls themselves, whose total (`transpile ms`) was already under 1 s on the `dim` profile in
  Phase 4. In-thread hooks must be synchronous, so the async half of item 18 is dropped, not deferred: it
  cannot coexist with this design. Its other half — bypassing ts-node — landed in full.
- **Item 21.** `registerLoader(specifier)` in `src/api/register-loaders.ts` is the one place the three
  registering contexts (main `getSupportCodeLibrary`, preload worker, parallel child) attach a loader. For
  tsflow's own `esnode-loader` / `esvue-loader` (recognised by the `/transpilers/esm/<name>` suffix of the
  specifier) on a Node with `module.registerHooks` (22.15 / 23.5+), it `import()`s the `.mjs` by path
  relative to `lib/api` and passes `{ resolve, load }` to `registerHooks()`, deduplicated per thread because
  hooks stack. Everything else — the ts-node loaders, third-party loaders in the `loader` list, older Node,
  or `TSFLOW_ESM_HOOKS=async` — goes through `register(specifier, pathToFileURL('./'), timingRegisterOptions())`
  exactly as before. No `engines` bump: the fallback is the runtime alternative the item's scope allowed.
  `@types/node` 22.13 does not declare `registerHooks`, hence the cast. The dynamic `import()` from the CJS
  build is emitted natively because the base tsconfig uses `module: node18`; no `require(esm)` is involved.
- **Synchronous hooks see `require()`.** Verified with a probe on Node 24.16: `registerHooks` hooks are
  invoked for every `require()` on the thread with `context.conditions` containing `'require'` (and no
  `'import'`), while `register()` hooks never see `require()` at all. Without a guard, the extension probe
  would have returned `{ url: '.../foo.js', format: 'module', shortCircuit: true }` for tsc's extensionless
  `require('./foo')` inside `lib/` and broken every CJS load. `isRequire(context)` in `loader-utils.mjs`
  short-circuits those to `nextResolve`/`nextLoad` at the top of both hooks. The same probe confirmed
  `registerHooks` is thread-local (a worker's registration is invisible to the main thread), so preload
  workers register their own hooks as they always did, and that `nextResolve('./x.ts')` returns
  `format: null` on 24.16, so the `format: 'module'` our `load` returns is what decides.
- **Dual-mode hooks.** The esbuild loaders' `resolve`/`load` are plain synchronous functions that also work
  under `register()`: every helper is synchronous, sources are read with `readFileSync` rather than via
  `nextLoad`, and the hooks return whatever `nextResolve`/`nextLoad` return without inspecting it (a value
  in-thread, a promise on the hooks thread). One consequence to be aware of: a consumer loader listed
  _after_ ours in `loader` can no longer transform the raw `.ts`/`.vue`/`.json` source before we see it,
  because we never call `nextLoad` for those; ts-node's `load` used to. No spec or known consumer chains
  loaders that way.
- **Item 18.** `loadTypeScript(url)` reads the file and calls `transpileCode(code, filename, undefined,
  { esbuild: { sourcemap: 'inline' } })` from `esbuild.mjs` — the `_options.esbuild` spread already existed,
  so `esbuild.mjs` did not change. ts-node is gone from the esbuild loaders entirely: `tsnode-service.mjs`
  (which `require`d `ts-node-maintained` at loader initialisation, before any TypeScript file) is deleted,
  along with `getEsmHooks`, `createHookExports` and the `tsNodeHooks`/`getTsNodeHooks`/`handleTsFiles`
  options of `resolveSpecifier`. Explicit `.ts`/`.tsx` specifiers now fall through to Node's resolver (ts-node's
  was only ever consulted for specifiers that already carried the extension, where the two agree).
  `tsnode-loader.mjs` keeps its ts-node fallback resolve and applies the `format: 'module'` override for
  `.ts`/`.tsx` specifiers itself, preserving the old step-2 behaviour. `esbuild-transpiler.mjs`, its
  bundled `esbuild-transpiler-cjs.js`, the `src/scripts/build-esm-transpiler-cjs.js` script, the
  `build:transpiler` step and the `exports` entry were removed too, on the owner's decision: the ts-node
  `Transpiler` plugin was public surface, but no tsflow loader used it any more and no known consumer
  referenced it. `yarn build` is now `genversion` + `tsc --build` + the `.mjs` copy, and `src/scripts/`
  no longer exists.
- **Timing report shape.** In-thread loaders record `esm:hooks-init`, `esm:resolve` and `esm:load` into the
  registering thread's store, so on the spec workspaces those rows now sit under "Main process" and each
  `preload:<n>`, and the "Main process ESM loader hooks" section appears only under `TSFLOW_ESM_HOOKS=async`
  or for the ts-node loaders. `collectLoaderTimings()` resolves immediately when no port was handed out.
  `esm:hooks-init` for an esbuild loader is now the `import()` of the loader module (esbuild, tsconfig-paths,
  the logger/timing twins): 91 ms in the main process on `node-esm`, where Phase 3 measured 128–141 ms for
  ts-node service creation on the hooks thread.

### Measured effect on the large suite

UIS Tools `dim` profile (324 scenarios, 1363 steps, `es-vue-esm`, experimental decorators, serial),
`TSFLOW_TIMING=true`, same build, same machine and session, all runs green. This is a true A/B on one build:
**sync** rows are the default (`module.registerHooks()`, hooks in the main thread), **async** rows set
`TSFLOW_ESM_HOOKS=async` (`module.register()`, hooks on the loader thread — the Phase 4 mechanism, but with
item 18's ts-node bypass in both). Runs sync 1–4 and async 1–3 were taken back to back after `yarn build`;
sync 5–7 and async 4–5 were interleaved afterwards (s5, a4, s6, a5, s7) to control for drift. Run 1 was the
cold run after the build. Sync runs 2 and 4 were disturbed by the machine (run 4 recorded a 34.7 s
`bootstrap` and a 6.3 s `esm:hooks-init` for work that takes 0.4 s and 0.08 s in every other run) and are
shown struck out of the comparison, not hidden. `esm:*` rows for sync come from the main-process table; for
async from the "Main process ESM loader hooks" table. Async has no `esm:hooks-init` row because the esbuild
loaders no longer create a ts-node service and nothing else on the hooks thread is timed at initialisation.

| Mode  | Run | `bootstrap` ms | `esm:hooks-init` ms | `esm:resolve` ms (2828) | `esm:load` ms (920) | `support:import` ms | `runtime:run` ms | Wall  |
| ----- | --- | -------------- | ------------------- | ----------------------- | ------------------- | ------------------- | ---------------- | ----- |
| sync  | 1 (cold) | 757       | 113                 | 3802                    | 27968               | 102585              | 83865            | 196 s |
| sync  | 2 (disturbed) | 518  | 195                 | 2190                    | 1707                | 6493                | 61888            | 76 s  |
| sync  | 3   | 429            | 92                  | 703                     | 966                 | **3070**            | 39723            | 50 s  |
| sync  | 4 (disturbed) | 34740 | 6339               | 3225                    | 36101               | 126697              | 38278            | 256 s |
| sync  | 5   | 404            | 87                  | 681                     | 965                 | **3041**            | 37381            | 49 s  |
| sync  | 6   | 431            | 80                  | 653                     | 922                 | **2957**            | 38664            | 48 s  |
| sync  | 7   | 392            | 76                  | 646                     | 939                 | **2906**            | 46566            | 55 s  |
| async | 1   | 410            | —                   | 723                     | 911                 | **3206**            | 36865            | 47 s  |
| async | 2   | 434            | —                   | 743                     | 948                 | **3392**            | 37061            | 46 s  |
| async | 3   | 400            | —                   | 714                     | 935                 | **3260**            | 36804            | 46 s  |
| async | 4   | 415            | —                   | 729                     | 933                 | **3356**            | 37362            | 47 s  |
| async | 5   | 511            | —                   | 895                     | 1114                | **3981**            | 37808            | 48 s  |

Conclusions:

1. **Items 18 and 21 together are worth about 0.3 s of a 3.2–3.4 s warm startup on this profile, roughly
   10%.** The four clean sync runs put `support:import` at 2.9–3.1 s; the five async runs, same build, put it
   at 3.2–4.0 s (3.2–3.4 s excluding async 5). The hooks' own execution barely moved (`esm:resolve`
   0.65–0.70 s vs 0.71–0.90 s, `esm:load` 0.92–0.97 s vs 0.91–1.11 s), which is what item 21 predicts: the
   cost it removes is the round trip _around_ each hook call, and that shows up only as the difference
   between `support:import` and the sum of its parts. About 4.2 k hook invocations at roughly 70 µs of
   thread hop apiece is the 0.3 s.
1. **Wall clock cannot resolve this.** `runtime:run` was 37.4–46.6 s across the clean sync runs and
   36.8–37.8 s across async, a spread an order of magnitude larger than the startup difference; the
   48–55 s versus 46–48 s wall clocks are that noise, not a regression (nothing in Phase 5 touches the
   per-step path).
1. **Against Phase 4 (`support:import` 3.7–4.6 s, `esm:load` 1.0–1.3 s, `esm:hooks-init` 128–141 ms in
   Phase 3), startup on this profile is now 2.9–3.1 s.** Part of that gap is item 18 (the async rows above
   already include it and sit below Phase 4's numbers), part is item 21, and part is session-to-session
   variance; the within-session A/B above is the only attribution that should be trusted.
1. The remaining 2.9 s is ~1.6 s of hook execution (esbuild transpile plus resolution for 920 loads and
   2828 resolves) and ~1.3 s of genuine module evaluation. Item 16's on-disk cache attacks the transpile
   share of the 0.93 s `esm:load`; Phase 6 should be scoped against that figure, as the Phase 4 notes
   already said.

### Notes specific to Phase 6

- Phase 6 (items 16, 17, 22, 15) builds the content-addressed cache into the `load` hook. For the esbuild
  loaders that hook is now `loadTypeScript()` / `loadVue()` in `loader-utils.mjs`, running synchronously on
  the importing thread, so cache reads and writes must be synchronous `fs` calls; that is natural for an
  on-disk cache and rules nothing out. The ts-node loaders are unchanged and still asynchronous on the hooks
  thread, so a cache that must cover them too needs both call shapes.
- Item 22 (concurrent `import()` of support files) should be re-rated before Phase 6 commits to it: with
  in-thread hooks, `load` blocks the importing thread while esbuild runs, so concurrent `import()` calls
  cannot overlap transpilation any more; whatever it recovers is module-evaluation overlap only.
- Item 17 (preload transpiles into the cache): preload workers now run the esbuild hooks in their own
  thread as well, so "transpile in the worker, read from the cache on the main thread" has no thread hop in
  either direction. Re-read `origin/Dev-Prebuild` ("Remove parallel load support", flagged in the Phase 1
  hand-off and still unexamined) before spending effort here.
- **ESM callsite source mapping (the unrated correctness item from the Phase 4 notes) was not done**, but
  this phase removes its structural blocker for the esbuild loaders: the transpiled output with its inline
  map (`sources: [<absolute .ts path>]`) is now produced on the same thread that later resolves callsites.
  The enabling change is small — `loadTypeScript()` records `url → map` on a `globalThis` map and
  `Callsite.resolve()` in `our-callsite.ts` consults it before `sourceMapSupport.wrapCallSite` — but decoding
  the map needs either `source-map` (already installed transitively under `source-map-support`, not a direct
  dependency; adding one is the owner's call) or a hand-written VLQ decoder. `sourceMapSupport.install({
  retrieveSourceMap })` stays rejected for the Phase 4 reasons. The ts-node loaders would still report raw
  positions unless the map crosses the `MessageChannel`.
- With the hooks in-thread, Node's `esm:resolve`/`esm:load` rows measure the hooks' own execution as before,
  but the message round trips they used to sit behind are gone, so a fall in `support:import` that is
  larger than the fall in `esm:*` is expected and is the point of item 21.
- Prettier's `endOfLine: crlf` applies to everything under `cucumber-tsflow/src`; the Write tool and
  heredocs produce LF, so run `prettier --write` on touched files before judging the diff.
- Build with `yarn build`, never bare `tsc`; run `yarn test:all` before calling the phase done; take at
  least three runs per build on the UIS profile and discard run one.

## Phase 6 hand-off

Written at the start of the Phase 7 session, the morning after Phase 6 closed, so that Phase 7 can start
cold. Phase 6 was a developer-experience phase, not a performance one; nothing in it was measured on the
large suite and nothing in it was expected to move the Phase 5 numbers.

### State of the tree

- Still on branch `2026-09-performance-enhancements`. Phase 6 is five commits: `3a03d4e` ("Startup
  progress: themed phase lines with a worker-thread spinner, wrapping naturally"), `78ca080` ("Startup
  spinner: colour wheel with a three-cell wipe; park the cursor below the block"), `37a596e` ("LOTR startup
  theme: emoji on every line, beacons moved to the load phase"), `5500456` ("ESM callsites map to TypeScript
  lines; startup counter in parentheses") and `ed5bbbf` ("Track the performance research notes and workspace
  settings"). The Phase 5 removals that were uncommitted at the end of that session (`esbuild-transpiler.mjs`,
  `build-esm-transpiler-cjs.js`, the `exports` entry, the `research/` directory) went in with `3a03d4e` and
  `ed5bbbf`. The working tree was clean at the start of the Phase 7 session.
- `yarn build` clean, no stray `.js` under `src/`, `lib/` newer than every source file. `yarn test:all`
  green on all sixteen variants on the tree that became `5500456` (the spec reports under
  `cucumber-tsflow-specs/reports/` are from that run, 2026-09-16 15:42–15:44). Terminal output was checked
  on a real console window with the `verify-console-output` skill added in this phase, not in the captured
  shell.
- Files changed (source): new `src/utils/startup-progress.ts` and `src/utils/startup-progress-worker.ts`;
  `src/api/run-cucumber.ts` (phase lines and callbacks), `src/api/support.ts`, `src/api/loader-worker.ts`,
  `src/api/parallel-loader.ts` (`onFileLoaded` and the `PROGRESS` message), `src/runtime/make-runtime.ts`
  and `src/runtime/parallel/adapter.ts` (`onWorkerReady`); `src/transpilers/esm/loader-utils.mjs`
  (`sourcemap: 'both'`, the per-URL source-map store), `src/utils/our-callsite.ts` (trace-mapping lookup),
  `src/types/global.d.ts`; `package.json` (`@jridgewell/trace-mapping` as a direct dependency) and
  `yarn.lock`. Docs: `CHANGELOG.md`, `Architecture.md` ("Startup progress" section, callsite paragraph),
  `README.md` ("Startup progress"), `CLAUDE.md` (the console-verification rule), the `pnpm-link-consumer`
  skill, and the new `.claude/skills/verify-console-output/`.
- The UIS Tools VueApp link (`pnpm-link-consumer` skill) is in place and points at the current build
  (`7.7.2` on both sides). The UIS `package.json` and `pnpm-lock.yaml` carry that local-only change and
  must not be committed there.
- Added at the start of the Phase 7 session, uncommitted at the time of writing: this hand-off,
  `research/scripts/attribute-cpuprofile.js`, a "Profiling a run" section in
  `research/local-consumer-testing.md`, and a `.gitignore` rule for `research/profiles/`.

### What Phase 6 landed

- **Item 26, the fixed part.** `runCucumber()` prints one line per startup phase — `resolve`, `preload`
  (only with `parallelLoad`), `load`, `assemble`, `launch` — between `Running Cucumber-TsFlow …` and the
  first formatter output. On a TTY each line has a bracketed spinner in a fixed slot, a themed title, a
  plain-language detail and a `(done/total)` counter, and ends with a check mark, a summary and the elapsed
  time; a message line beneath carries heartbeat quips after 30 s of silence and a relief message when work
  resumes after a stall. The spinner is drawn by a `worker_threads` worker writing through its own
  `tty.WriteStream` on the same file descriptor, because the main thread is blocked for most of a phase
  (the first support file's `import()` runs its whole graph through the in-thread hooks) and a main-thread
  timer cannot fire; the main thread waits on an `Atomics` signal for the closing line so the two threads'
  writes stay ordered. Nothing is fitted to the console width: lines are written whole and wrap, and the
  block is redrawn from its first row using a row count derived from the current width, re-read every frame.
  The spinner colour walks a twelve-colour wheel independent of theme and progress. `TSFLOW_THEME` selects
  `pickle` (default), `lotr` or `off`. On a non-TTY stream (CI, a captured shell, a file) the lines are
  append-only and no worker starts, so formatter output and report files are untouched.
- **Item 26, the harness.** `.claude/skills/verify-console-output/` runs built code in a fresh console
  window at several widths and reads the screen buffer back. It exists because a captured shell has
  `isTTY === false` and cannot show redraws, colours or glyph widths; two console facts it uncovered are in
  `Architecture.md` (the TTY stream rather than raw `fs.writeSync`, `CSI 1G` rather than `\r`).
- **Item 26, not done.** None of the optional candidates were taken up: `TSFLOW_TIMING` is still an
  environment variable and not a `--timing` flag, `--verbose` does not report the hooks mode or Node
  version, and transpile errors still surface as a stack rather than a code frame. They remain candidates.
- **Item 28.** Under `es-node-esm` / `es-vue-esm`, step definitions now report their TypeScript line and a
  working-directory-relative `uri`. `loadTypeScript()` transpiles with `sourcemap: 'both'` and keeps each
  module's map on `globalThis.__CUCUMBER_TSFLOW_SOURCE_MAPS`, keyed by URL, on the thread that later
  resolves callsites; `Callsite.resolve()` traces `file:` frames through it with
  `@jridgewell/trace-mapping` (new direct dependency, one decoded `TraceMap` per module) and falls back to
  `source-map-support` for anything not recorded — the ts-node loaders, and the esbuild loaders under
  `TSFLOW_ESM_HOOKS=async`, still report raw positions. Verified with the message formatter on the
  `node-esm` and `vue-esm` specs; CJS unchanged.

### Measured effect on the large suite

None taken. In the captured shell used for the UIS timing runs stdout is not a TTY, so the progress
worker never starts and the Phase 5 `dim` figures stand as the current baseline. The cost of the spinner
worker on a real console (one extra thread, a write every 130 ms during startup) has not been measured and
is not expected to be visible against the 37–47 s of `runtime:run`; it is off entirely with
`TSFLOW_THEME=off`.

### Notes specific to Phase 7

Phase 7 is item 27: one measurement session, no library change. The question is how much of the 37–47 s
`runtime:run` on the UIS `dim` profile is tsflow's own code, and the answer decides whether a runtime
phase exists at all.

- **Capture.** Run the CLI's bin file directly under `node --cpu-prof` from the UIS `test` directory. Do
  not use `NODE_OPTIONS` through `corepack pnpm`: corepack and pnpm are Node processes too and would write
  their own profiles into the same directory. Write the profiles into `research/profiles/<label>/` in this
  repository (gitignored) rather than anywhere under the UIS checkout, whose `.gitignore` has no rule for
  `.cpuprofile` files. The full recipe, with the environment variables, is under "Profiling a run" in
  [local-consumer-testing.md](local-consumer-testing.md).
- **Attribute.** `node research/scripts/attribute-cpuprofile.js <main-thread .cpuprofile>` prints self
  and inclusive time by layer (tsflow, cucumber-js, jsdom, vue, esbuild, source maps, other dependencies by
  package, node internals, V8 pseudo-frames, consumer files), tsflow's share by `lib/` directory, and hot
  functions overall and within tsflow. By default it attributes only the `runtime:run` window, found as the
  first sample with a `lib/runtime/` frame (`Coordinator.run`, the adapters' `run`, `runBeforeAllHooks`,
  `runTestCase`, the `TestCaseRunner` methods) on the stack; `--all` covers the whole profile and
  `--from-ms`/`--to-ms` set an explicit window. Builtins with no file (`readFileUtf8`, regex, sort, …) are
  charged to the nearest caller that has one, so a builtin called from tsflow counts as tsflow; the hot
  tables still name them. It was checked against a `vue-esm` spec profile (the marker lands 342 ms before
  the end of a 36 s run, which is that suite's entire runtime) and against the UIS `utils` profile.
- **What "tsflow" means in the split.** Frames under `…/cucumber-js-tsflow/cucumber-tsflow/lib/` (the
  linked real path; Node resolves the symlink) or `…/@lynxwall/cucumber-tsflow/`. CucumberJS's own runtime
  (`assembleTestCases`, `runTestRunHooks`, the formatters' envelope handling, `@cucumber/messages`) is
  `cucumber-js`, not tsflow, even though tsflow calls it. The inclusive column answers "how much of the run
  had tsflow anywhere on the stack"; on a serial run that will be nearly everything and is not the number
  that matters. The number that matters is tsflow's **self** time plus the self time of builtins it called,
  which is what the layer table's `self ms` for `tsflow` already is.
- **Idle.** `(idle)` is the event loop with nothing to run — awaiting a timer, I/O or a child. On the
  serial `dim` run, idle inside `runtime:run` is time no JavaScript was using, which points at waits in the
  consumer's steps (`await nextTick`, timers, jsdom's async behaviour) rather than at any library. Report
  it as its own row; it is likely to be a large one.
- **Three runs, discard the first.** The Phase 5 rule holds: `runtime:run` varied 37–47 s across clean
  runs of one build. Take at least three profiles and compare the layer percentages, which are far more
  stable than the milliseconds. Keep `TSFLOW_TIMING=true` on so each profile has a timing report beside
  it (the `runtime:run` row is the denominator the split should be checked against; the two agree to
  within the cleanup tail after the runtime ends). `TSFLOW_THEME=off` keeps the spinner worker out of the
  picture on a real console; in a captured shell it never starts anyway.
- **One profile per thread.** `--cpu-prof` writes `CPU.<date>.<time>.<pid>.<tid>.<seq>.cpuprofile`; the
  main thread is `tid` 0. The `dim` profile is serial with no `parallelLoad`, so one file is expected; a
  second one means a worker thread ran (the spinner, or a preload worker on another profile).
- **The `default` profile's startup is part of this phase.** It has never been measured, and items 16 and
  24 are both priced against it. A `TSFLOW_TIMING=true` run of `corepack pnpm -F uis-tools-test test` (about
  1380 scenarios, 208 step files, several minutes) — three runs, discard the first, same as `dim` — gives
  the startup total and its `esm:load` / transpile share. Record it in the Phase 7 hand-off next to the
  `dim` split. The `origin/Dev-Prebuild` decision (`parallelLoad` kept or removed, which settles items 15 and 17)
  is also outstanding and belongs to the owner.
- Build with `yarn build`, never bare `tsc`; nothing in this phase should need a build at all. If the
  profile does turn up a tsflow hot spot worth fixing, that is a new phase with its own hand-off, not a
  change to make inside this one.

## Phase 7 hand-off

Written at the end of the Phase 7 session (2026-09-17) so that Phase 8 can start cold. Phase 7 changed no
library code. It answered item 27 — where does `runtime:run` go on a large consumer — and took the first
measurement of the full UIS suite, which items 16 and 24 are priced against.

### State of the tree

- Still on branch `2026-09-performance-enhancements`; Phase 6 ended at `ed5bbbf` and nothing under
  `cucumber-tsflow/src` changed in this phase. `lib/` is the Phase 6 build (`7.7.2`), which is what the UIS
  link ran. At the time of writing the Phase 7 files were **uncommitted**: this hand-off and the Phase 6
  hand-off above, `research/scripts/attribute-cpuprofile.js`, the "Profiling a run" section of
  `research/local-consumer-testing.md`, and the `.gitignore` rule for `research/profiles/`.
- The captured profiles, console logs (each with its `TSFLOW_TIMING` report) and attribution outputs are
  under `research/profiles/dim-run{1..3}/` and `research/profiles/default-run{1..5}/`, gitignored. The
  profiles are 40–130 MB each; regenerate rather than move them. `attribution.txt` / `.json` in each
  directory is the runtime window; `attribution-startup.txt` (dim 2, dim 3, default 5) is the startup
  window.
- The UIS Tools VueApp link is unchanged and must not be committed there.

### Method

Every run is the recipe under "Profiling a run" in [local-consumer-testing.md](local-consumer-testing.md):
the CLI's bin file run directly under `node --cpu-prof` from the UIS `test` directory, `TSFLOW_TIMING=true`,
`TSFLOW_THEME=off`, stdout captured (so no spinner thread), one `.cpuprofile` per run. `dim` (334
scenarios, 1396 steps, 200 files through the ESM hooks) was sampled at the default 1 ms; `default` — the
full component test suite, **1571 scenarios, 6992 steps, 974 files loaded, 2578 `load` and 9632 `resolve`
hook calls** — at 2 ms to keep the files near 100 MB. Attribution is `research/scripts/attribute-cpuprofile.js`
over the `runtime:run` window (first sample with a `lib/runtime/` frame to the end of the profile, which
includes the formatter and timing-report tail after the runtime returns); the window agreed with the
timing report's `runtime:run` row to within 20 ms on `dim` and 1.4 s (0.6%) on `default`, the tail being
the three report files. The startup split is the same script with `--to-ms=<window start>`.

Three of the five full-suite runs had disturbed **startup** rows (`bootstrap` 11–15 s against 0.4 s, `esm:load`
34–60 s against 3.6 s). Runs 2 and 3 overlapped with the `dim` attribution jobs I was running in this
session, which parse 40 MB of JSON each; run 4 overlapped with nothing I know of. The runtime window of
runs 3 and 4 was unaffected (the layer percentages match run 5 to within a point) and is used; their
startup rows are not. **Do not run anything heavy while a measurement is in flight**, and treat a
`bootstrap` over a second as a disturbed run.

### Where `runtime:run` goes

`dim`:

| Run | Wall | `support:import` ms | `runtime:run` ms | window ms |
| --- | ---- | ------------------- | ---------------- | --------- |
| 1 (cold) | 64 s | 23030 | 37617 | — |
| 2 | 40 s | 2991 | 33201 | 33218 |
| 3 | 40 s | 2924 | 33866 | 33882 |

`default`:

| Run | Wall | `bootstrap` ms | `support:import` ms | `esm:load` ms | `runtime:run` ms | window ms | Note |
| --- | ---- | -------------- | ------------------- | ------------- | ---------------- | --------- | ---- |
| 1 (cold) | 273 s | 436 | 39599 | 22633 | 224208 | 225891 | first full run on this build |
| 2 | 495 s | 15368 | 137619 | 60016 | 304344 | — | disturbed throughout; discarded |
| 3 | 261 s | 11562 | 14125 | 4071 | 216615 | 216679 | startup disturbed; runtime used |
| 4 | 314 s | 12389 | 79541 | 34063 | 196096 | 197584 | startup disturbed; runtime used |
| 5 | 233 s | 409 | 7706 | 3608 | 219890 | 221267 | clean; the startup baseline |

Self time by layer (self = the sampled frame's own file, with builtins charged to their JavaScript caller;
inclusive = that layer anywhere on the stack). `dim` runs 2 and 3, `default` runs 3, 4 and 5:

| Layer | dim 2 | dim 3 | default 3 | default 4 | default 5 | What it is |
| --- | --- | --- | --- | --- | --- | --- |
| jsdom (+ nwsapi, cssstyle, symbol-tree) | **55.1%** | 55.0% | **65.4%** | 64.2% | 65.1% | DOM tree walks, `querySelectorAll`, `getComputedStyle` |
| vue (`@vue/*`) | **21.4%** | 21.3% | **11.8%** | 11.8% | 11.8% | reactivity, mount, render |
| other dependencies | **12.8%** | 13.2% | **9.5%** | 9.2% | 9.3% | PrimeVue 6–8%, `regexp-match-indices` 1%, Testing Library, `expect` |
| `(garbage collector)` | 3.7% | 3.7% | 6.7% | 7.8% | 7.3% | |
| `(idle)` | 4.8% | 4.6% | 4.6% | 5.0% | 4.6% | event loop with nothing to run |
| node internals | 0.7% | 0.8% | 0.5% | 0.6% | 0.5% | |
| cucumber-js (`@cucumber/*`) | 0.3% | 0.4% | 0.5% | 0.4% | 0.5% | |
| consumer (`test/`, `tools/src/`) | 0.5% | 0.5% | 0.4% | 0.4% | 0.4% | the step and fixture code itself |
| **tsflow** | **0.4%** (123 ms) | 0.4% (124 ms) | **0.4%** (823 ms) | 0.4% (738 ms) | 0.4% (837 ms) | |
| `(program)` | 0.3% | 0.2% | 0.2% | 0.2% | 0.2% | |

tsflow's 0.8 s on the full suite splits `lib/runtime` 0.36 s, `lib/bindings` 0.26 s, `lib/formatter`
0.18 s. Its hottest function is `stepFunction` in `binding-decorator.js` — the wrapper that resolves the
scenario context and invokes the bound method — at 177–213 ms for 6992 steps, **25–30 µs a step**; then
`getStepData` in the behave JSON formatter (79–95 ms), `storeTestStepResult` (68–70 ms), `runStep`,
`aroundTestStep`. Nothing else in tsflow reaches 50 ms on a 220 s run. The inclusive 54% is not a cost: it
is the share of samples taken while a tsflow frame was on the stack (every synchronous step body runs
under `stepFunction`), and the rest are promise continuations with no tsflow caller.

Where the jsdom time goes (`dim` run 2, self by file; the full suite has the same shape): `helpers/style-rules.js`
2.1 s (`getComputedStyle` — walking every stylesheet rule for every element asked), `symbol-tree` 1.9 s (tree
traversal), `generated/Element.js` 1.5 s (`getAttribute` wrappers), `nwsapi` 1.2 s of its own plus **1.6 s
in a builtin `Resolver` called from `nwsapi match_assert`** — the compiled selector functions behind
`querySelectorAll`, the single largest hot spot in the profile at 5% — `node.js` `query`/`filter` 1.2 s,
`Node-impl.js` `textContent` 1.1 s, `cssstyle` 0.9 s.

Inclusive time by package on the full suite (run 3; overlapping): jsdom 65.6%, `@cucumber/cucumber` 54.4%,
`@testing-library/dom` 49.8%, `dom-accessibility-api` 44.0%, `nwsapi` 43.1%, `@vue/runtime-core` 32.7%,
`@vue/reactivity` 27.2%, `@primevue/core` 17.7%, `@testing-library/vue` 16.6%, `@vue/test-utils` 16.5%.
Inclusive by consumer file: `test/fixtures/uis-tools-render.ts` 32.0 s · 14.8% (the mount fixture),
`shared/then-steps.ts` 12.3 s · 5.7%, `uis-agent/research/ticket-queue.ts` 10.9 s · 5.0%,
`shared/when-steps.ts` 9.3 s · 4.3%, `uis-agent/chat/compaction-settings.ts` 8.9 s · 4.1%,
`access-tools/my-request/my-requests.ts` 6.1 s · 2.8%.

**One framework-side cost, upstream of tsflow.** `@cucumber/cucumber-expressions` 19.0.0 (`TreeRegexp.match`)
runs every step match through the `regexp-match-indices` 1.0.2 polyfill. That package's `getPolyfill()`
tests `new RegExp('a').exec('a').indices`, which is `undefined` on every engine because indices are only
produced with the `d` flag, so it never selects the native path and always takes the `regexp-tree`
rewrite. On the full suite that is `regexp-match-indices` 1.9–2.1 s self plus `regexp-tree` 0.5–0.6 s —
**2.5–2.7 s, 1.2% of the run, about 0.4 ms a step** — consistent across all five runs and the largest
single dependency cost outside the DOM stack. It is CucumberJS's dependency, not ours; the fix is upstream
(pass `d` and use native `exec`, or fix the feature test in `regexp-match-indices`). Recorded as item 29
below.

### Where startup goes

`dim` (runs 2 and 3, the first 4.1 / 4.0 s: `bootstrap` + `config` + `support:import` + `registry:update` +
`formatters:init` + `gherkin` + `makeRuntime`) and `default` (run 5, the first 9.1 s):

| Layer | dim 2 | dim 3 | default 5 | Hot spots (default 5) |
| --- | --- | --- | --- | --- |
| node internals | 3.09 s · **75.5%** | 2.97 s · 74.4% | 5.46 s · **59.9%** | `internalModuleStat` 1.0 s, `ModuleWrap` 0.5 s, `readFileUtf8` 0.49 s, `lstat` 0.31 s, `compileFunctionForCJSLoader` 0.30 s, `readPackageJSON` 0.25 s, `existsSync` 0.24 s |
| esbuild | 0.33 s · 8.0% | 0.33 s · 8.4% | 1.54 s · **16.9%** | `runCallSync` — the `.ts`/`.vue` script transpiles |
| other dependencies | 0.32 s · 7.7% | 0.32 s · 7.9% | 0.71 s · 7.7% | module evaluation of the consumer's dependency graph |
| vue | 0.14 s · 3.4% | 0.15 s · 3.6% | 0.59 s · 6.5% | `@vue/compiler-sfc` 0.45 s / **1.25 s inclusive** — compiling the `.vue` files |
| cucumber-js | 0.05 s | 0.06 s | 0.21 s · 2.3% | |
| tsflow | 0.04 s · 1.0% | 0.04 s · 1.0% | 0.18 s · 2.0% | `tsconfig-paths` 0.24 s inclusive |
| jsdom | 0.05 s | 0.05 s | 0.05 s | `jsdom-global` set-up 0.45 s inclusive |

The timing report for `default` run 5 says the same thing in its own columns: `support:import` 7.7 s of which
`esm:load` 3.6 s and `esm:resolve` 1.9 s; the per-file `transpile ms` total is 2.86 s (esbuild plus the SFC
compiler), 974 files. So on the full suite the transpile work is about 2.8 s of a 9.1 s warm startup, and
Node's own resolve, read and compile of the module graph is about 5.5 s; on `dim` the split is 0.8 s of
4 s against 3 s. tsflow's own startup code is 40 ms on `dim` and 180 ms on the full suite.

### Conclusions

1. **There is no tsflow runtime phase.** tsflow's self time inside `runtime:run` is 0.4% on both suites,
   stable across five runs, and its hottest function costs 25–30 µs a step. CucumberJS is another
   0.4–0.5%. The runtime is jsdom (55% on `dim`, 65% on the full suite), Vue (21% / 12%) and the PrimeVue
   component library (8% / 6%), driven by the consumer's `@testing-library` queries and assertions
   (`querySelectorAll`, `getComputedStyle`, accessible-name computation). Item 27 is closed with "none
   found"; the runtime items that Phase 2 removed were the last.
1. **For the UIS suite's owners, the run time is in the tests' DOM queries, not the framework.** The two
   largest single costs are `nwsapi` selector matching under `querySelectorAll` (5%) and jsdom's
   `getComputedStyle` (6%), both reached through `@testing-library/dom` and `dom-accessibility-api` (role
   and accessible-name queries walk the tree and compute styles per element; together they are on the
   stack for 44–50% of the run). Narrower queries (`getByTestId`, scoping to a container), fewer
   visibility assertions, and reusing mounts within a scenario (`uis-tools-render.ts` is on the stack for
   15–23% of the run) would move the number; nothing in cucumber-tsflow will. This is outside the worklist
   and is recorded here for the consumer, not as a phase.
1. **Startup is mostly Node's module loader, with the transpilers a real second.** On the full suite,
   Node resolving, reading and compiling 974 modules is 5.5 s of a 9.1 s warm startup; esbuild plus the Vue
   SFC compiler are 2.8 s. That is the number Phase 8 is for: item 16's on-disk cache can recover up to
   about 2.8 s (31%) on the full suite and 0.8 s on `dim` — provided it caches the `.vue` compile as well as
   the esbuild output — and nothing of the 5.5 s. The items that attack the module graph itself, 24 (load
   only the step files a filtered run needs) and 25 (one bundle instead of 974 module loads), are the only
   ones that reach the larger share.
1. **Idle is small and GC is not.** Idle is 4.6–5% of the run on both suites; the suite is CPU-bound in
   jsdom, so there is no waiting to overlap and `parallel: N` (the consumer's configuration) is the only
   lever that changes the wall clock without changing the tests. Garbage collection is 7–8% on the full
   suite against 3.7% on `dim`, which points at the consumer's per-scenario DOM and component churn, not
   at anything the library allocates.
1. **The one framework-side cost found is upstream.** The `regexp-match-indices` polyfill in
   `@cucumber/cucumber-expressions` costs 1.2% of the run through a broken feature test. Worth a report or
   PR upstream; not worth a tsflow phase.

### Re-rating after Phase 7

| #   | Change | I/C after Phase 5 | I/C now | Why |
| --- | --- | --- | --- | --- |
| 16  | Content-addressed on-disk transpile cache | 4 / 7 | 4 / 7 | Confirmed by measurement: esbuild + SFC compile are 2.8 s of a 9.1 s warm startup on the full suite (0.8 s of 4 s on `dim`). Must cache `loadVue()` output too or it gets only the esbuild 1.5 s. |
| 23  | `reloadSupport()` as a CLI watch mode | 5 / 7 | 5 / 7 | Unchanged: the only item that removes the 5.5 s of module loading from the inner loop. |
| 24  | Persisted `pattern → source file` index | 7 / 9 | 7 / 9 | Now priced against a measured 9.1 s full-suite startup over 974 files; a filtered run loads a small fraction of them. |
| 25  | esbuild `build()` bundling | 5 / 10 | 6 / 10 | Now aimed at the largest measured startup cost (Node's per-module resolve/read/compile, 5.5 s) rather than at hook overhead. Still last on complexity. |
| 27  | Attribute `runtime:run` | ? / 2 | closed | Measured: tsflow 0.4%, cucumber-js 0.4–0.5%, on both suites. No runtime phase follows. |
| 29  | **New: `regexp-match-indices` polyfill in cucumber-expressions** | — | 1 / 1 (upstream) | 1.2% of `runtime:run`, 0.4 ms a step, from a feature test that can never pass. Report or PR to `cucumber/cucumber-expressions` (or `regexp-match-indices`); nothing to do in tsflow. |

### Notes specific to Phase 8

- Phase 8 is item 16 first. Decide up front what the cache stores: esbuild output only (1.5 s on the full
  suite) or the `.vue` SFC compile as well (`loadVue()` in `loader-utils.mjs`, another 1.25 s). The second
  is where almost half of the recoverable time is, and it is the same `load` hook.
- The cache saves nothing of Node's own resolve/read/compile of the module graph (5.5 s). Expect
  `support:import` on the full suite to fall from 7.7 s towards 5 s on a warm cache, not further.
- Measure it with the same recipe: profile the startup window (`attribute-cpuprofile.js --to-ms=<window
  start>`) before and after and compare the `esbuild` and `vue` rows and the timing report's `transpile ms`
  column; `default` run 5 in `research/profiles/` is the before. Three runs, discard the first, and nothing
  else running on the machine — three of the five full-suite runs in this phase had disturbed startup rows.
- The `parallelLoad` / `origin/Dev-Prebuild` decision is still the owner's and still gates items 15 and 17.
  Nothing in Phase 7 bears on it except that preload's only remaining purpose would be to warm the cache
  item 16 creates.
- Build with `yarn build`, never bare `tsc`; run `yarn test:all` before calling the phase done.

## Phase 8 hand-off

Written at the end of the Phase 8 session (2026-09-17) so that Phase 9 can start cold. Phase 8 landed item
16, the content-addressed on-disk transpile cache, behind `--no-transpile-cache`. Items 15 and 17 were
gated on the `parallelLoad` / `origin/Dev-Prebuild` decision when this was first written; the decision was
measured and taken later the same day — see [`parallelLoad` A/B on `dim`](#parallelload-ab-on-dim-2026-09-17-after-phase-8)
and [`parallelLoad` removal](#parallelload-removal-2026-09-17) below — and both items are dropped.

### State of the tree

- Still on branch `2026-09-performance-enhancements`; Phase 7 ended at `ed5bbbf` with its own files
  uncommitted, and at the time of writing everything from Phase 7 and Phase 8 was **uncommitted**: this
  hand-off and the Phase 7 hand-off, `research/scripts/attribute-cpuprofile.js`, the "Profiling a run"
  section of `research/local-consumer-testing.md`, the `.gitignore` rule for `research/profiles/`, and the
  Phase 8 source and documentation changes listed below. Check `git status` before assuming.
- `yarn build` clean, no stray `.js` under `src/`; `yarn test:all` green on all sixteen variants on the
  Phase 8 build; ESLint and Prettier clean on every touched file. The cache was exercised by the matrix
  itself: every spec profile has `parallelLoad: true`, so the preload threads populated it and the main
  thread read it in every variant.
- Files changed: new `src/transpilers/transpile-cache.ts`; `src/transpilers/esbuild.ts`,
  `src/transpilers/esm/esbuild.mjs` and `src/transpilers/vue-sfc-compiler.ts` (each transpile entry point
  wrapped in `withTranspileCache`); `src/cli/argv-parser.ts` (`transpileCache` option,
  `--transpile-cache` / `--no-transpile-cache`); `src/api/load-configuration.ts` (default and the
  `TSFLOW_TRANSPILE_CACHE` environment transport); `src/api/run-cucumber.ts` (load-phase summary and the
  prune call). Docs: `README.md` (option table row, new "Transpile cache" section), `Architecture.md`
  (Core Components entry, new "Transpile cache" subsection, a sentence under Parallel Preload),
  `CHANGELOG.md` (one `Added` entry).
- The UIS Tools VueApp link is unchanged and must not be committed there. Its cache is at
  `Tools.Web/VueApp/test/node_modules/.cache/cucumber-tsflow/transpile` — the `test` directory is its own
  pnpm workspace package with its own `node_modules`, which is the nearest one above the working directory —
  974 entries, 16 MB, for the `default` profile. `research/profiles/p8-*` holds the Phase 8 console logs
  (and, for the first series, CPU profiles), gitignored.

### What Phase 8 landed

- **Scope decision: the cache covers the Vue SFC compile as well as esbuild.** The Phase 7 notes priced the
  two halves at 1.5 s and 1.25 s of the full suite's 2.8 s transpile total, so caching esbuild alone would
  have left almost half on the table. `compileVueSFC` is wrapped at its own level, which covers every Vue
  transpiler in one place: `es-vue` and `ts-vue`/`ts-vue-exp` (`require-extension-hooks`), and `es-vue-esm`
  and `ts-vue-esm` (`loadVue` in `loader-utils.mjs`, which still runs its `transformImports` regex pass over
  the cached output; that pass was never in the transpile figures). esbuild is wrapped in both
  `transpileCode` functions: `esbuild.ts` (CJS, reached through ts-node's `Transpiler` plugin for `es-node`
  and `es-vue`) and `esm/esbuild.mjs` (the in-thread `load` hook for `es-node-esm` and `es-vue-esm`). Not
  covered, deliberately: ts-node's own TypeScript output for `ts-node`, `ts-vue`, `ts-node-esm` and
  `ts-vue-esm`; it is produced inside ts-node's service, not by a tsflow call.
- **One CJS module, three callers.** `esm/esbuild.mjs` loads `lib/transpilers/transpile-cache.js` through
  `createRequire`, the pattern `esm/vue-sfc-compiler.mjs` already used, so within a thread all three entry
  points share one module instance and one set of counters, and there is no `.mjs` twin to keep in step.
- **The key** is a SHA-256 over: entry format version, tsflow version, caller `kind` (`esbuild-cjs`,
  `esbuild-esm`, `vue-sfc`), the caller's serialised configuration, the absolute file name, and the source
  text. The configuration carries the full esbuild `TransformOptions` (so `tsconfigRaw`, hence the decorator
  mode, and `sourcemap`) and the esbuild version; for `esbuild-esm` additionally the tsconfig
  `absoluteBaseUrl` and `paths` that `rewritePathMappings` bakes into the output as `file://` URLs — the
  analysis-3 portability point, honoured by making entries non-portable rather than by trying to make the
  output portable; for `vue-sfc` the style flag, output format, decorator mode and the consumer's `vue`
  version (`require('vue/package.json')`, `'unknown'` if unresolvable). The file name is in the key because
  esbuild names it in the source map and the Vue compiler derives the component id from it. Nothing is keyed
  on path or mtime alone. One known gap: whether a `<style lang="scss">` block compiles or is skipped depends
  on a preprocessor being installed, and that is not in the key; installing sass after a component was
  cached keeps the skip until the source, the `vue` version or the tsflow version changes.
- **Storage** is one JSON file per entry (`{ v, value }`, `value` being `{ output, sourceMap }` or
  `{ code }`), named by the key, in `TSFLOW_TRANSPILE_CACHE_DIR` or `.cache/cucumber-tsflow/transpile` under
  the nearest `node_modules` at or above the cwd (falling back to the nearest `package.json`'s directory,
  then the OS temp dir). Reads are one `readFileSync` plus `JSON.parse`; ENOENT is the miss path. Writes go
  to `<entry>.<pid>-<threadId>.tmp` then `renameSync`, so the N+1 contexts racing on an empty cache never
  see a partial entry and the last identical writer wins; any write failure (read-only location, a
  concurrent reader holding the target open on Windows) is swallowed and the transpile result still
  returned. An unparseable entry is deleted and treated as a miss. The cache can change whether a
  transpile runs, never what it returns.
- **Eviction**: `pruneTranspileCache()` is called once by `runCucumber` after the load phase and does
  nothing unless this process wrote entries, so a warm run never lists the directory. When it does run it
  stats every file, and if the total exceeds 512 MB deletes least-recently-written first until it fits —
  the garbage in a content-addressed store is exactly the entries no current source produces, and they
  are the oldest. 15 ms on the 200-entry `dim` cache, 75 ms on 974 entries.
- **Switch**: `transpileCache` (default true) in configuration, `--transpile-cache` /
  `--no-transpile-cache` on the CLI (both forms declared, like `--strict`/`--no-strict`, so commander does
  not inject a default that would override a profile). `loadConfiguration` writes the resolved value to
  `TSFLOW_TRANSPILE_CACHE`, which is what the transpilers read — that is the only transport that reaches the
  ESM hooks thread under `module.register()`, preload threads and parallel children alike, the same route
  `CUCUMBER_EXPERIMENTAL_DECORATORS` takes. An environment value already present is honoured as the default
  when the option is unset, so CI can disable it without touching configuration.
- **Visibility**: the load-phase progress line ends with `N of M transpiles from the cache` (main-process
  counters), and the timing report gains `transpile-cache:hit` / `transpile-cache:miss` phases whose
  `calls` column is the count and whose `ms` is the lookup time (hit) or lookup plus transpile plus write
  (miss), plus `transpile-cache:prune`. A hit still records a `transpile` file entry for its lookup time so
  the `files` column and the slowest-files table keep the same population between cold and warm runs.
- **Bootstrap notice (item 26, developer experience; owner's request after trying the build).** The first
  run of the Phase 8 build on the owner's machine, while screen-recording, sat visibly long between the
  `cucumber-tsflow -p default` command and `Loading configuration` — the `bootstrap` phase, Node loading the
  library's several hundred modules, during which nothing of tsflow's has run and nothing was printed.
  `bin/cucumber-tsflow.js` now prints one line before requiring the library (requiring `ansis` on its own
  for the colour) and `lib/cli/run.ts` prints `cucumber-tsflow loaded in N ms.` on entry
  (`performance.now()`, the `bootstrap` figure), gated by a `globalThis.__CUCUMBER_TSFLOW_BOOTSTRAP_ANNOUNCED`
  flag so programmatic callers never see it. Both in `ansis.dim`, the phase-detail grey, at the owner's
  request; no spinner and no theme, by the owner's choice: two lines that are superfluous at the usual 0.4 s and the point when
  it is 29 s (the first run after a `yarn build`, when Node's compile cache is rebuilt for the changed
  files — observed on the spec workspace today, 390–399 ms on the two runs after). Skipped for
  `--version`, `--help`, `--i18n-*` and under `TSFLOW_THEME=off`, so the measurement recipe's output is
  unchanged. Documented in README (Startup progress), Architecture (CLI) and the CHANGELOG.
- **The preload phase now does what its documentation claimed.** With `parallelLoad: true` the worker
  threads' misses write the entries the main thread then reads: on the `node` spec workspace's cold cache,
  four preload threads recorded 80 misses and the main thread 19 hits of 19. That is most of item 17's
  stated payoff without item 17's reshaping; what 17 would still buy is dropping module evaluation (and the
  160-line `window` shim) from the workers.

### Measured effect on the large suite

UIS Tools VueApp, `es-vue-esm`, experimental decorators, serial, `TSFLOW_TIMING=true`, `TSFLOW_THEME=off`, one
build (`7.7.2` plus Phase 8), one machine, one session, back to back. This is a true A/B on the build: **warm**
rows run with the cache populated by an earlier run, **off** rows pass `--no-transpile-cache` (the pre-Phase 8
code path: `withTranspileCache` returns `produce()` without touching the disk), **cold** is the first run with an
empty cache. The first series (`dim` 1–5, `default` 1–4) ran under `node --cpu-prof` per the Phase 7 recipe; the
second (`dim` 6–9, `default` 5–7) without profiling and with a 45 s pause before each run. `transpile ms` is the
per-file total from the file-totals table (on a warm run it is the cache lookup time, since a hit records a
`transpile` entry); `hits`/`misses` are the `transpile-cache:*` `calls`. The machine carried the owner's own
load throughout (an editor, Teams, Zoom, Spotify at 40–60% CPU between runs), so disturbed runs are shown struck
through by note rather than hidden and excluded from the conclusions: the criterion is `bootstrap` over a second
or a startup row more than double its neighbours with a normal `runtime:run`.

`dim` (334 scenarios, 200 files through the hooks):

| Run | Cache | `bootstrap` ms | `esm:resolve` ms | `esm:load` ms | `transpile ms` | hits / misses | `support:import` ms | `runtime:run` ms | Note |
| --- | ----- | -------------- | ---------------- | ------------- | -------------- | ------------- | ------------------- | ---------------- | ---- |
| 1 | cold | 524 | 1388 | 2185 | 1220 | 0 / 200 | 5655 | 54 s | profiled; first run, discard |
| 2 | warm | 422 | 627 | **270** | **44** | 200 / 0 | **2175** | 40 s | profiled |
| 3 | off | 434 | 905 | 1296 | 987 | — | 3682 | 101 s | profiled; runtime disturbed, startup mildly |
| 4 | warm | 22021 | 4651 | 25316 | 3476 | 200 / 0 | 88600 | — | disturbed throughout; discarded |
| 5 | off | 913 | 2539 | 3812 | 3015 | — | 10641 | — | disturbed throughout; discarded |
| 6 | warm | 452 | 621 | **259** | **42** | 200 / 0 | **2267** | 39.0 s | |
| 7 | off | 398 | 631 | 929 | 702 | — | **2888** | 38.3 s | |
| 8 | warm | 527 | 657 | **280** | **49** | 200 / 0 | **2497** | 37.9 s | |
| 9 | off | 442 | 672 | 946 | 702 | — | **3004** | 38.3 s | |

`default` (1571 scenarios, 974 files through the hooks, 2578 `load` and 9632 `resolve` calls):

| Run | Cache | `bootstrap` ms | `esm:resolve` ms | `esm:load` ms | `transpile ms` | hits / misses | `support:import` ms | `runtime:run` ms | Note |
| --- | ----- | -------------- | ---------------- | ------------- | -------------- | ------------- | ------------------- | ---------------- | ---- |
| 1 | cold | 900 | 6514 | 44073 | 6118 | 200 / 774 | 76665 | 689 s | profiled; disturbed throughout (3× runtime, four 5 s step timeouts); discarded |
| 2 | warm | 20339 | 7899 | 68045 | 17719 | 974 / 0 | 154026 | 492 s | profiled; disturbed throughout (same four timeouts); discarded |
| 3 | off | 454 | 4764 | 7745 | 5996 | — | 17152 | 218 s | profiled; startup disturbed (every row 2× run 6), runtime normal; startup discarded |
| 4 | warm | 432 | 2084 | **1106** | **311** | 974 / 0 | **5519** | 214 s | profiled; clean, all 1571 passed |
| 5 | warm | 426 | 1748 | **927** | **254** | 974 / 0 | **5116** | 196 s | clean |
| 6 | off | 435 | 1586 | 3054 | 2394 | — | **6692** | 188 s | clean |
| 7 | off | 403 | 1717 | 3337 | 2531 | — | **7237** | 193 s | clean |

Conclusions:

1. **On the full suite the cache removes 2.1–2.4 s of `esm:load` and 1.2–2.1 s of `support:import` from a
   warm startup.** Clean pairs: `esm:load` 3.05–3.34 s off against 0.93–1.11 s warm, `transpile ms` 2.39–2.53 s
   against 0.25–0.31 s (974 lookups, 0.26–0.32 ms each, one `readFileSync` and a `JSON.parse` of a 16 KB
   average entry), `support:import` 6.7–7.2 s against 5.1–5.5 s. The transpile saving is what Phase 7 predicted
   (2.4–2.5 s measured here against the 2.86 s Phase 7 saw under the profiler); the wider `support:import`
   spread is module evaluation's own run-to-run variance, 0.4–0.5 s between two runs of the same mode.
1. **On `dim` it is 0.6–0.7 s of a 2.9–3.0 s startup, about 22%.** `esm:load` 0.93–0.95 s off against
   0.26–0.28 s warm, `transpile ms` 0.70 s against 0.04–0.05 s, `support:import` 2.89–3.00 s against
   2.27–2.50 s, over two interleaved pairs (6/7 and 8/9) whose `runtime:run` agreed to within 1.1 s.
1. **What remains of startup is Node.** Warm, the full suite's `support:import` is 5.1–5.5 s of which the hooks
   account for 2.7–3.2 s (`esm:resolve` 1.7–2.1 s over 9632 calls — the extension probing and tsconfig `paths`
   lookups, cached per path since Phase 3 — plus `esm:load` 0.9–1.1 s, of which the transpile lookups are
   0.25–0.31 s and the rest is reading 974 sources and returning them) and module evaluation the balance. That
   is the number Phase 9's item 24 is priced against.
1. **Cold runs are unchanged in kind and slightly dearer in degree:** the miss path is the old transpile plus a
   `JSON.stringify` and two file operations, 1.7 s over 200 misses on the clean `dim` cold run against 1.0 s of
   transpile — about 3.5 ms per entry written, paid once per source change.
1. **Nothing changed in the runtime,** as expected: `runtime:run` 188–218 s across the clean full-suite runs and
   37.9–39.0 s across the clean `dim` runs, warm and off interleaved, with every scenario passing in every
   clean run. The four timeouts in `default` runs 1 and 2 were in `features/dim/suites/tests-in-suite.feature`,
   whose scenarios passed in all nine `dim` runs with the same cache entries and in `default` runs 3–6; they
   were the machine.

### `parallelLoad` A/B on `dim` (2026-09-17, after Phase 8)

The owner leaned towards removing `parallelLoad` (the `origin/Dev-Prebuild` outcome) but asked for the
measurement first. Same build, same machine, same session as the Phase 8 series, `dim` profile, serial,
`TSFLOW_TIMING=true`, `TSFLOW_THEME=off`, the cache pointed at a scratch directory through
`TSFLOW_TRANSPILE_CACHE_DIR` so the consumer's own cache was untouched; **cold** rows start from an empty
directory, **warm** rows reuse the previous run's 200 entries. `--parallel-load` on the command line gives
four preload threads (`min(availableParallelism(), 4)` on a 14-core machine). A discarded warm-up run
absorbed the first-run-after-`yarn build` compile-cache rebuild; 45 s pause between runs. Logs in
`research/profiles/p8b-preload-ab/` (gitignored). `startup` is the report header's "ms since process start"
less `runtime:run`, so it includes bootstrap, preload, load, assemble and launch.

| Run | Preload | Cache | `preload` ms | main `esm:load` ms | main transpile-cache | main `support:import` ms | startup ms | Note |
| --- | ------- | ----- | ------------ | ------------------ | -------------------- | ------------------------ | ---------- | ---- |
| 1 | off | cold | — | 1671 | 200 miss | 4283 | **5624** | |
| 2 | off | warm | — | 294 | 200 hit | 2436 | **3580** | |
| 3 | on | cold | 5841 | 298 | 200 hit | 2463 | **9686** | |
| 4 | on | warm | 5919 | 266 | 200 hit | 2451 | **10007** | |
| 5 | off | cold | — | 33555 | 200 miss | 114509 | — | `bootstrap` 31 s; disturbed throughout, discarded |
| 6 | on | cold | 6024 | 272 | 200 hit | 2343 | **9553** | |
| 7 | off | warm | — | 331 | 200 hit | 2595 | **3795** | |
| 8 | on | warm | 5132 | 275 | 200 hit | 2378 | **8710** | |

Inside the preload phase (four threads, per-thread figures are wall time on that thread, running
concurrently): each worker's `support:import` was 4.4–5.5 s, of which `esm:resolve` 1.2–1.3 s over about
2270 calls per thread and `esm:load` 0.4–1.3 s; the workers' transpile total across all four was
2.6–2.7 s cold (about 200 misses plus about 250 hits on entries a sibling thread had just written) and
0.2 s warm. The rest, some 3 s per thread, is module evaluation: every worker imports jsdom through
`vue-jsdom-setup.mjs` and evaluates its share of the 200 files with their dependency graphs, work that
is discarded with the thread. Runtime figures are omitted: the UIS checkout had been fast-forwarded that
morning and its `node_modules` held both `vue@3.5.17` and `vue@3.5.18`, so 202 of 334 scenarios failed
in every run, preload on or off, with `Cannot read properties of null (reading 'ce')` in `renderSlot`
across the two runtime-core copies. That was the consumer's state, not this build's, and it did not touch startup,
which completes before the first scenario. Cause: the pull had moved the workspace from pnpm 10 to pnpm 11, and the
first install under pnpm 11 re-pointed the hidden hoist link `node_modules/.pnpm/node_modules/vue` at 3.5.18, which
is what `@vue/test-utils`, `@uis/testing-bdd` and `primevue` resolve `vue` through (they have no peer link of their
own) while the components link to 3.5.17. A clean reinstall (`npkill` then `pnpm install`) resolved it and the full
UIS suite passed again on this build.

Conclusions:

1. **Preload makes every run slower, cold and warm.** Cold: 9.6–9.7 s startup with preload against 5.6 s
   without. Warm: 8.7–10.0 s against 3.6–3.8 s. The phase costs 5.1–6.0 s and the most it can save is
   the cold main-thread transpile, 1.8 s here (`support:import` 4.28 s cold against 2.46 s behind a
   preload-warmed cache). It never comes close to paying for itself.
1. **The cost is module evaluation, not transpilation, and evaluation cannot be moved off the main
   thread.** Even on a warm cache each worker spends 4.4–4.9 s evaluating a module graph the main thread
   then evaluates again. Item 17's transpile-only workers would remove that, but the whole transpile
   saving on offer is 1.8 s cold and nothing warm, against thread startup, a ts-node service, an esbuild
   service and a Go child per thread.
1. **The data supports removal** (position 1 in the session discussion: delete the preload, keep the
   cache). Items 15 and 17 lose their subject with it, and the `preload` progress phase, the `PROGRESS`
   message, the `SerializableBindingDescriptor` transfer, the `__LOADER_WORKER` decorator branch and the
   `window` shim in `loader-worker.ts` go with them. `origin/Dev-Prebuild`'s removal commit (`be86c28`,
   717 deletions across 20 files) is the shape of the change, but it is two commits off an April master
   and `loader-worker.ts` has changed underneath it, so the deletion is redone on this branch rather than
   merged. Every spec profile sets `parallelLoad: true`, so the option needs a documented fate for
   existing consumers (ignored with a deprecation notice, or removed from the option table and rejected).

### `parallelLoad` removal (2026-09-17)

Taken on the A/B above, in the same session. The owner chose position 1 — delete the preload, keep the cache — and
asked that existing configurations keep working, so:

- Deleted `src/api/loader-worker.ts` (with its 160-line browser `window` shim) and `src/api/parallel-loader.ts`; the
  preload block in `run-cucumber.ts` and `load-support.ts`; the `__LOADER_WORKER` branch in `binding-decorator.ts` and
  the global declaration; `SerializableBindingDescriptor` / `serializeBinding` and `BindingRegistry.toDescriptors()` /
  `getDescriptorSourceFiles()`; the `preload` phase in `StartupPhaseId` and both themes (`Making the brine`, `Stoking
  the forges of Isengard`); and the `preload:<n>` section and family-table row of the `TSFLOW_TIMING` report.
  `mergeTimingSnapshot` stays for the parallel children. The compiled `lib/api/loader-worker.*` and
  `parallel-loader.*` had to be deleted by hand: `tsc --build` does not remove outputs of deleted sources.
- `parallelLoad` remains in every public type as an optional `@deprecated` field (`ITsflowConfiguration`,
  `IConfigurationExt`, `ITsFlowRunOptionsRuntime`, `TsFlowRuntimeOptions`, `ITsFlowLoadSupportOptions`) and
  `--parallel-load [THREADS]` is still parsed, as a hidden commander `Option` whose parser returns `true`. Nothing
  reads the value except `loadConfiguration`, which, when it is truthy, prints the notice below to stdout through the
  same `Console` as `Loading configuration from …`: a blank line, ten stars, a blank line, then
  `DEPRECATION NOTICE:` (bold) and three sentences ending in what to remove — `"parallelLoad" from "<config file>"`
  when it came from the file, `the --parallel-load flag from the command line` when `options.provided` carried it.
  An explicit `parallelLoad: false` is silently ignored. Verified for both sources and for the silent case from a
  scratch directory; `--help` no longer lists the flag.
- All eight spec profiles lost their `parallelLoad` keys (the matrix printed no notice). README (both copies),
  Architecture, CLAUDE.md and the changelog (`Deprecated` and `Removed` entries under Unreleased) updated; the
  historical 7.7.0 release notes in the README were left as written.
- Versioning: the branch stays a **minor** release. The option is accepted and ignored, the flag still parses, every
  programmatic type still compiles, and the changelog says the field goes in the next major — the
  deprecate-in-minor, remove-in-major pattern. `yarn build` clean, no stray `.js` under `src/`, `yarn test:all` green
  on all sixteen variants.
### Re-rating after Phase 8

| #   | Change | I/C after Phase 7 | I/C now | Why |
| --- | --- | --- | --- | --- |
| 16  | Content-addressed on-disk transpile cache | 4 / 7 | done | Landed and measured; see above. |
| 15  | Preload thread count from `availableParallelism()` | 3 / 3 | dropped | The preload was removed after the A/B below; there is no thread count to derive. |
| 17  | Reshape `parallelPreload` to transpile into the cache | 6 / 7 | dropped | The A/B below showed the whole saving on offer was 1.8 s, cold only, against a 5–6 s phase; the owner removed the preload rather than rebuild it. The cache delivers the durable half of what 17 promised. |
| 23  | `reloadSupport()` as a CLI watch mode | 5 / 7 | 5 / 6 | The cache is process- and thread-independent and keyed on content, so a watch mode's re-transpile of an edited file is a miss for that file and hits for everything else with no eviction design needed; the ESM module-graph eviction question is unchanged. |
| 24  | Persisted `pattern → source file` index | 7 / 9 | 6 / 9 | Now priced against the warm cached startup, in which transpile work is a few hundred milliseconds and nearly everything left is Node's own resolve/read/compile/evaluate of the module graph. Loading fewer files is still the only lever on that, but the absolute number it can recover on a warm run is about 5 s rather than 9 s. |
| 25  | esbuild `build()` bundling | 6 / 10 | 6 / 10 | Unchanged: it attacks the module-graph cost the cache does not touch. |

### Notes specific to Phase 9

- Phase 9 is items 19 and 24. Price 24 against the **warm cached** `default` startup measured here, not the
  Phase 7 9.1 s: with the cache, `support:import` on the full suite is about 5.5 s and almost none of it is
  transpilation, so what 24 recovers is module loading and evaluation of the files a filtered run does not
  need.
- The `parallelLoad` / `origin/Dev-Prebuild` decision is closed: measured, then removed (see
  [`parallelLoad` removal](#parallelload-removal-2026-09-17)). Items 15 and 17 are dropped and `origin/Dev-Prebuild`
  has nothing left to contribute; its first commit, an ahead-of-time esbuild build into `.tsflow-build`, is prior
  art for item 25 and nothing else.
- When measuring startup on this machine, three of seven full-suite runs in this session and two of nine
  `dim` runs had disturbed startup rows (`bootstrap` 0.9–22 s against 0.43 s, or every startup row doubled
  with a normal `runtime:run`); all five were in the profiled first series, the pattern matched each run's
  100 MB `.cpuprofile` being written at its end and scanned at the next run's start, and it stopped when
  profiling was dropped and a 45 s pause added between runs — though the owner's own applications were
  also loading the machine, so the attribution is a fit, not a proof. Measure
  startup from the timing report alone unless a layer split is the question.
- Build with `yarn build`, never bare `tsc`; run `yarn test:all` before calling the phase done.

## Phase 9 hand-off

Written at the end of the Phase 9 session (2026-09-17) so that Phase 10 can start cold. Phase 9 landed item 19
(parse the features before loading support code) and item 24 (selective support loading) behind the
`selectiveLoad` option, default off.

### State of the tree

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

### What Phase 9 landed

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

### Verified on the spec workspaces

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

### Measured effect on the large suite

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

### Re-rating after Phase 9

| #   | Change | I/C after Phase 8 | I/C now | Why |
| --- | --- | --- | --- | --- |
| 19  | Parse Gherkin ahead of support loading | 3 / 5 | done | Landed as the precondition for 24; the early exit was deliberately left out. |
| 24  | Persisted `pattern → source file` index | 6 / 9 | done | Landed and measured: 199 of 216 files and 683 of 968 modules skipped on a one-scenario run, `support:import` 4.6 s → 2.9 s. Less than its rating promised, because the always-loaded set-up (jsdom, jest, Vue) is most of what remains. |
| 23  | `reloadSupport()` as a CLI watch mode | 5 / 6 | **7 / 6** | The measurement above says the inner loop's floor is 2.5 s of set-up modules that a fresh process must always load; a resident process is the only thing that removes them. Selective loading gives a watch mode its change detection for free (a stale entry is exactly an edited file's dependents). |
| 25  | esbuild `build()` bundling | 6 / 10 | 5 / 10 | On a filtered run 24 now removes most of the module-graph cost 25 was aimed at; 25's remaining case is the full run's 968-module load. |

### Notes specific to Phase 10

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

## Phase 10 hand-off

Written at the end of the Phase 10 session (2026-09-18) so that Phase 11 can start cold. Phase 10 landed item 23:
`--watch`, a resident process that reruns on file changes or Enter and keeps the support code loaded between runs.

### State of the tree

- Branch `2026-09-speed-enhancements` (earlier hand-offs call it `2026-09-performance-enhancements`); Phase 9 ended
  at `9d7565d`. Phase 10 is committed as `66bec31` ("Watch mode: one resident process that reruns on file changes or
  Enter"), after the owner's code review on 2026-09-22 and a fresh green `yarn test:all` on all sixteen variants. That
  commit also carries the Phase 11 notes and the new [Phase 12 scope](#phase-12-scope). The tree was clean after it;
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

### What Phase 10 landed

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

### Verified on the spec workspaces

All runs on the built `lib/`, driven through piped stdin; "first run" includes the process bootstrap.

| Workspace / profile | First run | Reruns | What was checked |
| --- | --- | --- | --- |
| `node-esm` / `esnodeesm` (ESM, esbuild in-thread) | 10.7 s | 66–135 ms | Enter; touch of `basic-test.ts`; an assertion flipped in it fails run 4 (`1 failed`, stack shows `basic-test.ts?tsflow=3`, reported location `basic-test.ts:97`), restored passes run 5; `(rerun N: 7 evaluated again, 0 kept loaded)` |
| `node` / `esnode` (CJS, esbuild) | 462 ms | 73–134 ms | same cycle; `1 other module` is `fixtures/reload-fixture.ts`, which the reload-support scenarios require at run time |
| `node-esm` / `tsnodeesm` (ts-node ESM, `module.register()`) | 4.5 s | 3.7–4.0 s | fallback: `Support code cannot be kept loaded between runs (…); each run starts a fresh process`, one bootstrap notice per run |
| `vue-esm` / `esvue-esm` (Vue ESM, jsdom) | 34.8 s | 205–271 ms | `(rerun 1: 8 evaluated again, 1 kept loaded)`: the kept file is `vue-jsdom-setup.mjs`; touching `fixtures/scenario-context.ts` gives `1 other module` and its four importers re-evaluate; `9 of 9 transpiles from the cache`, so the `.vue` components stayed loaded |
| `node` / `esnode`, `watch-mode-test.feature` | 1.8 s for the scenario | — | the spec: three runs on the `watch` profile, `3 scenarios (3 passed)` each, `(rerun N: 2 evaluated again, 0 kept loaded)`, exit code 0 |

### Measured effect on the large suite

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

### Re-rating after Phase 10

| #   | Change | I/C after Phase 9 | I/C now | Why |
| --- | --- | --- | --- | --- |
| 23  | `reloadSupport()` as a CLI watch mode | 7 / 6 | done | Landed as `--watch`. A one-scenario rerun on the UIS suite is 1.1 s (0.8 s with `selectiveLoad`) against 7.8 s for a fresh process; on the spec workspaces 70–270 ms against 0.5–35 s. Not for whole-suite reruns on a suite that leaves state behind: the heap grows by what each run retains. |
| 25  | esbuild `build()` bundling | 5 / 10 | 4 / 10 | The inner loop no longer pays the module graph at all; 25's remaining case is the fresh-process full run (CI, the first run of a session), where the 968-module load is 5.8 s warm on this suite. |

### Notes specific to Phase 11

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
- Watch-mode behaviour to keep in mind when touching loading: `getSupportCodeLibrary` is now called more than
  once per process by design, so anything registered there must be idempotent or deduplicated (the
  `module.register()` fix in this phase is the example); `BindingRegistry.clear()` runs before every rerun; the
  `SupportReloader` decides from the *previous* run's observations, so a change to what "registered something"
  means must be reflected in `endFile()`.
- Watch mode's memory behaviour is the suite's, not tsflow's (`utils` flat at 60 MB over four runs; `dim` +1.1 GB
  live per run). If a future phase wants to help such suites, the candidates are a documented per-run reset hook
  (`AfterAll` is the consumer's tool already) or a `--watch` option to re-evaluate the set-up modules too, at the
  cost of the floor Phase 9 measured; neither was started. A cheap diagnostic that was not built: a heap snapshot
  after a run (`v8.writeHeapSnapshot()`) behind an environment variable, to name the retaining module.
- When measuring on this machine, the first run of a session is frequently disturbed (three of this session's
  first runs were; the fourth, the full suite, was not). The rerun numbers are far more stable than any first run.
- Build with `yarn build`, never bare `tsc`; run `yarn test:all` before calling the phase done.

## Phase 11 hand-off

Written at the end of the Phase 11 session (2026-09-22) so that Phase 12 can start cold. Phase 11 was item 25,
the esbuild `build()` bundling prototype, and it is **closed without a prototype**: the only case left for it
after Phases 9 and 10 is the fresh-process full run, and that case has a ceiling of one to three seconds
against a four-minute CI run. The owner judged that below the bar for the most complex item on the list ("if
this saves five seconds of five minutes, the juice is not worth the squeeze"). No library code changed in this
phase; what follows is the measurement, the reasoning and the feasibility findings, recorded so that a future
attempt can start from them rather than from the rating.

### State of the tree

- Branch `2026-09-speed-enhancements`; Phase 10 ended at `43269ac` and nothing under `cucumber-tsflow/src`
  changed in this phase. `lib/` is a fresh `yarn build` of that commit (`7.7.2`), which is what the UIS link ran.
  This phase adds only this hand-off, the phased-plan entry above, and a paragraph in
  [local-consumer-testing.md](local-consumer-testing.md) about disturbed measurements.
- The console logs of the three measurement runs, each ending in its `TSFLOW_TIMING` report, are under
  `research/profiles/p11-bundling/startup-{1..3}.log` (gitignored, like every profile directory).
- The UIS Tools VueApp link is unchanged and must not be committed there.

### Method

Three fresh-process runs of the UIS `default` profile filtered to one scenario, from the UIS `test` directory:

```sh
TSFLOW_TIMING=true TSFLOW_THEME=off node ../node_modules/@lynxwall/cucumber-tsflow/bin/cucumber-tsflow.js \
  -p default --name "Loading indicator displays while reviews are loading"
```

`selectiveLoad` is off in that profile and `--watch` was not used, so the filter loads all 216 support files and
the startup rows are those of a full run while `runtime:run` stays under a second. Run 1 is the cold run after
`yarn build` and is discarded as always. The clean reference is the undisturbed fresh one-shot run of the same
filter and the same build lineage recorded in the [Phase 10 hand-off](#phase-10-hand-off).

### What was measured

| Run | `bootstrap` | `gherkin` | `support:import` | `esm:resolve` (calls) | `esm:load` (modules) | `transpile-cache:hit` (files) | `runtime:run` | Wall clock |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 (cold, discarded) | 442 ms | 1932 ms | 182.3 s | 9.3 s (9407) | 77.5 s (2564) | — (968) | 892 ms | 187 s |
| 2 | 1235 ms | 360 ms | 18.6 s | 7.4 s (9407) | 3.3 s (2564) | — (968) | 793 ms | 24 s |
| 3 | 866 ms | 315 ms | 19.0 s | 7.7 s (9407) | 3.5 s (2564) | 978 ms (968) | 722 ms | 23 s |
| Phase 10 clean reference | 449 ms | 173 ms | 5.96 s | 2.31 s (9407) | 1.11 s (2564) | ~0.3 s (968) | 352 ms | 7.8 s |

Runs 2 and 3 are **disturbed, uniformly**: every phase is about three times the clean reference, including the
ones that do no module loading at all (`gherkin` 315–360 ms against 173 ms; 968 transpile-cache hits in 978 ms
against about 300 ms), which is the signature of the whole process being starved rather than of a regression in
one path. The cause was found and is worth recording because it is not the `bootstrap`-at-30-s pattern the
earlier notes describe: an orphaned Git Bash process, started the previous morning (2026-09-21 09:45), whose
parent shell had already exited, was scanning the entire disk and had accumulated 4.4 CPU-hours:

```text
"C:\Program Files\Git\usr\bin\find.exe" / -maxdepth 8 -iname common-library-3.1.0*.jar
```

Module loading is dominated by exactly the calls such a scan competes for (Phase 7's startup attribution:
`internalModuleStat`, `readFileUtf8`, `lstat`, `existsSync`, `readPackageJSON`). The machine sat at 64–65% CPU
throughout. The process was not killed during the session (it was not this session's) and the runs were not
retaken, because the decision below rests on the run's *structure* — the module counts, which are identical to
the clean reference — and on the clean reference's milliseconds, not on these.

### The ceiling

What bundling would remove, and what it would not, follows from counts that do not move with machine load:

- **2564 ES modules go through the loader hooks, of which 968 are project files** (the `transpile-cache:hit`
  count: 214 step files plus the `.vue` and `.ts` application sources they reach through 13 tsconfig aliases into
  `../tools/src`, which holds 531 `.vue` and 696 `.ts` files in total). The other **1596 are dependencies** —
  `vue`, PrimeVue, `@uis/testing-bdd`, `@testing-library/*` and their imports — which `packages: 'external'`
  leaves exactly as they are. Project modules are 38% of the ESM graph by count.
- **jsdom is outside bundling's reach entirely.** It is loaded by `require()` from `vue-jsdom-setup.mjs` under
  `support:require` (963 ms clean, about 500 CommonJS modules); the hooks hand `require()` straight to Node and a
  bundle of the support files would not touch it.
- **Upper bound.** If a bundle removed *every* cost of the 968 project modules — the resolve hook, the load hook,
  the cache read, and Node's own read, compile and link of each — the saving is bounded by roughly half of the
  clean 5.96 s `support:import`, about 3 s. Off that come the bundle's own read, compile and evaluation (one
  multi-megabyte module), and on a cache miss the `build()` itself, several hundred milliseconds for a thousand
  files. A realistic net is **1 to 3 s per fresh run**.
- **Denominators.** The full suite is 4 m 1 s clean (Phase 10; `support:import` was 5.13 s of it), so the saving
  is about **1% of a CI run**. On `dim` (about 40 s) it is at most 7%. In the inner loop it is nothing: a
  `--watch` rerun is 1.1 s and does not load the module graph, and `selectiveLoad` skips 683 of the 968 modules
  on a one-scenario run.

Set against the item's complexity — the highest on the list, for the correctness argument in
[item 25](#25-esbuild-build-bundling-to-replace-per-file-transformsync) and the findings below — the owner closed
it. A measured rather than derived ceiling was offered (a throwaway bundle of the 216 support files timed against
the current loader, about an hour after the stray process is gone) and declined, since it is already the first
third of the prototype.

### Feasibility findings

Read from the source in this session, for whoever picks the item up again. They are ordered by how much each
would cost.

1. **Callsite mapping assumes one source per map.** `traceLoaderMap()` in `utils/our-callsite.ts` looks a
   frame's map up by module URL on `__CUCUMBER_TSFLOW_SOURCE_MAPS` and returns `fileURLToPath(url)` as the file
   name — the comment says why: "the map is for a single-file transform, so its only source is the module
   itself". A bundle's map has hundreds of `sources`, so the resolver would have to take `position.source`
   (resolved against the map's `sourceRoot`) and the bundle's map would have to be registered under the bundle
   URL, or written next to the bundle on disk so the `source-map-support` fallback finds it. Until then
   `updateSupportCodeLibrary()` in `bindings/binding-registry.ts` writes the bundle's path as every step
   definition's `uri` in every report. `rawPosition` stays unique inside a bundle, so `stepBindingKey()` and the
   duplicate-registration check are safe as they are.
1. **Watch mode and selective loading key on source paths.** `getBindingSourceFiles()` (which watch mode uses
   to find modules that apply decorators without being support files) and `removeBindingsForFile()` compare
   `rawFile` / `filename`; `recordImportEdge()` in `utils/module-graph.ts` records the URLs the resolve hook
   returns; `SupportReloader` evicts and versions by path. All of them would see the bundle, not the sources, and
   need the `build()` `metafile` to map back. Prototype with both features off, as the Phase 10 notes said, and
   count making them compose as part of the item.
1. **Two esbuild configurations would have to become one.** `transpilers/esbuild.ts` (CJS) and
   `transpilers/esm/esbuild.mjs` (ESM) each assemble `tsconfigRaw` from the decorator mode
   (`global.experimentalDecorators` in the CJS build, `CUCUMBER_EXPERIMENTAL_DECORATORS` in the `.mjs`). The ESM
   one additionally rewrites tsconfig `paths` imports to absolute `file:` URLs by regex (`rewritePathMappings()`)
   before `transformSync`, and `loadVue()` in `loader-utils.mjs` rewrites the SFC output's alias imports
   (`transformImports()`). A `build()` with `bundle: true` and the consumer's `tsconfig` resolves aliases natively,
   so both rewriters disappear on that path — which is the one genuine simplification bundling offers. esbuild
   0.25.10 lowers both decorator modes.
1. **Vue needs an `onLoad` plugin, and it is small.** `compileVueSFC(source, filename, { format: 'esm',
   enableStyle })` in `transpilers/vue-sfc-compiler.ts` already emits an ES module whose imports (`vue`, aliases,
   relative paths) the bundler would resolve; the `withTranspileCache()` wrapper around it stays valid per file,
   so a `.vue` file's compile is cached even when the bundle is not.
1. **One bundle, not one per support file.** `getSupportCodeLibrary()` in `api/support.ts` imports the
   `importPaths` sequentially, `test-setup.mjs` first (it installs jsdom mocks on `globalThis`, `document`,
   `window.URL` and `console`), after `vue-jsdom-setup.mjs` has been `require`d. A synthetic entry that imports
   the support files in that order preserves evaluation order and, because esbuild deduplicates within a bundle,
   module identity for shared helpers. One bundle per support file would give every bundle its own copy of each
   shared helper's module-level state (a store, a context holder), which is the identity failure item 25's rating
   warns about. For `format: 'cjs'` esbuild has no code splitting, so a single bundle is the only shape there in
   any case.
1. **Path-relative code moves.** A bundle relocates `__dirname`, `__filename` and `import.meta.url` to the
   bundle's location. The UIS suite uses none of them in its tests or application source (the one
   `import.meta.env.BASE_URL`, in the app router, would need a `define`), but a consumer that locates fixtures
   relative to its step file would break, and that is a documented-limitation kind of change, not a bug to fix.
1. **Where the hook time is, if anyone wants it without bundling.** `esm:resolve` — 9407 calls, 2.31 s clean,
   about 0.25 ms each — is the largest hook figure, and most of those calls are for dependency modules a bundle
   would not remove. Phase 7 attributed the bulk of it to Node's own resolver under `nextResolve`, not to the
   hook body (`resolveTsconfigPaths()` fast path, `recordImportEdge()`, `versionedUrl()`), so a hook-side change
   has little to gain either.

### Re-rating after Phase 11

| #   | Change | I/C after Phase 10 | I/C now | Why |
| --- | --- | --- | --- | --- |
| 25  | esbuild `build()` bundling | 4 / 10 | closed | Ceiling 1–3 s of a 241 s CI run (about 1%): 1596 of the 2564 ES modules are external dependencies a bundle leaves alone, jsdom loads by `require()` outside the hooks, and the inner loop is already served by `--watch` and `selectiveLoad`. The worklist is complete: every item has landed, been dropped by measurement, or been closed. |

### Notes specific to Phase 12

- Phase 12 is the release gate described under [Phase 12 scope](#phase-12-scope); this phase changed nothing it
  depends on.
- Before measuring anything on this machine, look for stray filesystem scanners first
  (`Get-Process | Sort-Object CPU -Descending | Select-Object -First 8`); this session's `find` had been running
  for a day. A `gherkin` row at three times its usual 170 ms with transpile-cache hits at 1 ms per file is the
  signature of disk contention, distinct from the `bootstrap` 10–30 s pattern of earlier notes, and it does not
  settle with repeated runs.
- Build with `yarn build`, never bare `tsc`; run `yarn test:all` before calling the phase done.

## Phase 12 scope

Phase 12 is the release gate. Phases 1–10 each ended green on `yarn test:all` (Phase 11 changed no code), but that
suite was written for the
product as it stood before Phase 1: nine feature files, all end-to-end through the built CLI, none of which
exercise the transpile cache, selective loading, the module graph, the startup progress line or the timing
instrumentation directly, and only one each for `reloadSupport()` and `--watch`. The phase has three strands.
They are deliberately one phase, and the reason is ordering: a refactor without a test is a change nobody can
verify, and a test written after the refactor only proves the refactored code does what the refactored code
does. Testing first, and letting the review findings accumulate while the tests are written, gives every later
tightening a net and turns the review from a read-through into a hands-on pass.

### Strand 1: test build-out (first)

- **Inventory what is new and how it is covered.** The modules added on this branch are `api/register-loaders.ts`,
  `api/selective-load.ts`, `api/support-reloader.ts`, `api/builder-fingerprint.ts`, `transpilers/transpile-cache.ts`,
  `utils/module-graph.ts`, `utils/startup-progress.ts`, `utils/startup-progress-worker.ts`, `utils/tsflow-timing.ts`,
  `cli/watch.ts` and the `bindings` entry point, plus substantial rewrites of `api/support.ts`, `api/run-cucumber.ts`
  and the ESM `.mjs` loaders. For each, record what the spec matrix already exercises indirectly and what has no
  test at all. The hand-off sections above list the behaviors each phase promised; those promises are the test
  list.
- **Decide the test vehicle before writing.** The spec workspaces are end-to-end and slow, and they are the right
  place for behavior a user sees: a cache hit on a second run, a selective run loading fewer files, a watch rerun
  after an edit. The pure modules — fingerprinting, the cache key and its invalidation inputs, module-graph
  stamping and change detection, the `SupportReloader` eviction decision, argv parsing, the progress line's
  stall/relief state machine — want unit tests that run in milliseconds without a CLI. The repository has no unit
  test runner today (only `chai` in the spec workspaces). `node:test` needs no new dependency and Node ≥ 22 is
  already required; adding mocha, vitest or jest is a dependency decision for the owner. Settle this first and
  add the script to the root `package.json` and CI.
- **Coverage that matters most**, in the order the risk suggests: (1) selective loading's fallback conditions —
  new files, changed import graphs, files that registered non-step bindings — since a wrong "skip" is a silently
  missing step; (2) transpile-cache invalidation on every key input (source, path, options, tool versions, tsflow
  version) and the `--no-transpile-cache` bypass; (3) watch mode's second and third run, both module systems,
  including the `?tsflow=<n>` versioning and `BindingRegistry.clear()`; (4) the `SupportReloader`'s "registered
  something" observation; (5) the parse-before-load buffering of Gherkin envelopes and its formatter ordering;
  (6) idempotency of everything on the load path when `getSupportCodeLibrary` runs twice in one process.
- Keep to the repository's rule: no tests that merely validate third-party APIs or that an exception is thrown.

### Strand 2: the review

- Read the branch diff module by module, with the tests from strand 1 open beside it. Look for: the same
  concern implemented twice in different phases (caching, path normalization and file stamping each appeared in
  more than one place); functions that grew a flag parameter per phase; options that Phase 8 or later made
  irrelevant but that are still parsed; instrumentation and checkpoints added for a measurement that is finished;
  `global.*` coordination that could now be a passed value; and files that have become two modules sharing a
  name. Record each finding as a one-line entry with the file and the proposed change before changing anything,
  so the list can be pruned with the owner.
- Land the refactors behind the strand 1 tests and the spec matrix, one concern per commit.
- Bring [Architecture.md](../Architecture.md), the README and the CHANGELOG up to the final shape in the same
  pass; the layer map and execution flow in Architecture.md describe Phase 9 and 10 correctly but not yet as a
  whole.

### Strand 3: housekeeping sweeps

- **`strictNullChecks`.** The build config leaves `strict` off, so `yarn build` passes code the editor flags.
  Today `npx tsc --noEmit -p tsconfig.node.json --strictNullChecks` (from `cucumber-tsflow/`) reports 21 errors in
  four files: `runtime/message-collector.ts` (12), `runtime/test-case-runner.ts` (5), `api/convert-configuration.ts`
  (3), `bindings/binding-context.ts` (1). Fix them, then turn the flag on in `tsconfig.json` so the build and the
  editor agree, and add a `typecheck` script. Consider `strict` as a whole at the same time (it adds one more
  error today, in the same files). Related: ESLint's `no-undef` cannot see the Node global types (`NodeJS.*`,
  `BufferEncoding`), which is why `cli/index.ts` and `cli/watch.ts` carry disables; typescript-eslint's guidance
  is to turn `no-undef` off for TypeScript files and let `tsc` own that check.
- **American English.** Source has 34 British spellings in 5 files, 28 of them `colour` and its identifiers
  (`wheelColour`, `coloured`, `Colours`), the rest `serialise`, `recognise`, `normalise`, `initialise`, `grey`.
  Documents have about 90 across 12 files, led by `behaviour` (39) and `colour` (21). Rename identifiers only after
  checking the `exports` map and the spec workspaces for consumers; CucumberJS's own names (`colorFns`) are already
  American, so nothing on that boundary changes. Do the documents with a scripted pass and a manual read.

### Exit criteria

- `yarn build` clean; `yarn test:all` green; the new unit-test script green and wired into CI.
- `typecheck` clean with `strictNullChecks` on; `yarn lint` clean without new disables.
- No British spellings in `cucumber-tsflow/src` or the root and research documents.
- Architecture.md, README and CHANGELOG describe the product as it ships, not as a sequence of phases.
- The review's findings list is fully resolved: each entry either landed or was closed with a reason.

## Phase 12 baseline

Written at the start of the Phase 12 session (2026-09-22), after grounding in the [Phase 12 scope](#phase-12-scope)
and a read-only coverage inventory of the branch, so that the decisions and the starting numbers are in one place.

### State of the tree at the start

- Branch `2026-09-speed-enhancements` at `9395c83` (the Phase 11 hand-off), clean. `yarn build` green, no stray
  `.js` under `src`; `npx eslint cucumber-tsflow/src` reports 0 errors and 1 warning (a missing semicolon in the
  generated `version.ts`).
- `npx tsc --noEmit -p tsconfig.node.json --strictNullChecks` from `cucumber-tsflow/`: **21 errors** in
  `runtime/message-collector.ts` (12), `runtime/test-case-runner.ts` (5), `api/convert-configuration.ts` (3),
  `bindings/binding-context.ts` (1). `--strict` reports the same 21 and nothing more.
- British spellings: **26 in `src`** across `utils/startup-progress.ts` (the `colour` family, 24), `cli/run.ts`,
  `api/support-reloader.ts`, `transpilers/transpile-cache.ts`, `utils/module-graph.ts` and
  `transpilers/esm/README.md`; about **90 in Markdown** across 15 files, 34 of them in this document.
- No unit test and no unit-test runner exist anywhere in the repository. The test suite is 16 CLI invocations
  over 9 shared feature files; `chai` is a devDependency of each spec workspace only.
- `selectiveLoad: true` is set in 5 of the 18 profiles, `transpileCache` and `watch` in none (`watch` is passed on
  the command line by the watch spec; `parallelLoad` is set nowhere, so its deprecation notice never runs). Both
  caches live under `node_modules/.cache`, so on a clean CI checkout every run takes the cold branch: the
  selective-load skip path and the transpile-cache hit path are never executed in CI, and no spec asserts on
  either.
- The root `README.md` is 1124 lines. The branch added 94 of them in one block (lines 447–557: startup progress,
  timing, compile cache, transpile cache, selective loading, watch mode, ESM loader hooks) plus two small edits.
  `cucumber-tsflow/README.md`, which is what npm publishes, was identical to the root README at `master` and is
  now 100 lines behind it. The root README has LF line endings against the repository's CRLF rule. There is no
  `docs/` folder.
- The root `lint` script pipes `eslint --fix` into `prettier --write` into the whole CJS, ESM and experimental
  test matrix, so it is not a lint gate.

### Decisions taken with the owner

| Decision | Choice | Why |
| --- | --- | --- |
| Unit-test runner | **`node:test`** (`node --test`), `chai` for assertions | No new dependency: Node 24 runs `.ts` test files directly through type stripping (confirmed against `lib/` in a smoke test) and handles the `.mjs` twins natively; `chai` is already in the tree and is what the spec step definitions use. vitest was considered and declined: the owner's team does not use it, and built-ins are preferred when they achieve what is needed. |
| Import target of the unit tests | the built **`lib/`** | It is what ships and what the spec matrix already tests; `yarn build` before `test:unit`, as for every other test script. |
| `TSFLOW_TIMING` instrumentation | **keep and test** | It is documented in README, CHANGELOG and Architecture.md and is the only way to diagnose a future startup regression. |
| Documentation layout | **`docs/` folder, one guide** | `docs/performance-and-diagnostics.md` takes the 94-line README block (transpile cache, selective loading, watch mode, startup progress, timing, hooks mode); the root README keeps one paragraph that links to it. The package README becomes a build-time copy of the root README so the two cannot drift again. The pre-existing README bloat (five "Release Updates" sections, about 80 lines duplicating the CHANGELOG) is flagged, not part of this phase. |
| Strand 2 depth | **full list, including the two large consolidations** | Module eviction exists twice and only the newer copy clears the registry; the decorator mode reaches the transpilers three ways. Both land only behind the strand 1 tests. |
| Spec workspaces' `chai` | **unchanged** | Migrating 59 step files (about 350 assertions) to `node:assert` was offered and not requested. |

### Coverage inventory

What the spec matrix exercises today, and what has no test, per module added or rewritten on the branch.
"Indirect" means the code runs in some spec profile but nothing asserts on its behavior.

| Module | Indirect coverage today | Untested behaviors that matter | Vehicle |
| --- | --- | --- | --- |
| `cli/argv-parser.ts` | only `-p <profile>` and `--watch` | the paired `--x` / `--no-x` declarations (bare form absent leaves `undefined`, `--no-x` leaves `false`), `mergeTags`, `mergeJson`, `validateCountOption`, positional paths clearing profile paths | unit, no seam |
| `utils/module-graph.ts` | selective load and watch only | `canonicalPath` on Windows drive letters and case, `isProjectModule` exclusions (the pnpm `link:` fix), `versionedUrl` with an existing query, the CJS fixed-point dependent closure, edge forgetting on `bumpModuleVersions` | unit; `require.cache` walkers need an injectable cache |
| `api/builder-fingerprint.ts` | every run, never asserted | each of the six fields `registeredBeyondSteps` compares | unit, no seam |
| `transpilers/transpile-cache.ts` | every run, cold, never asserted | invalidation on each key input (source, path, kind, options string, tool versions, tsflow version, entry format); `--no-transpile-cache`; corrupt-entry deletion; write failure still returning the result; prune order; the `node_modules` → `package.json` → `tmpdir` directory walk | unit (`produce` is a callback, `TSFLOW_TRANSPILE_CACHE_DIR` redirects the store); one e2e for the bypass and a warm hit |
| the three cache-key strings in `transpilers/esbuild.ts`, `esm/esbuild.mjs`, `vue-sfc-compiler.ts` | CJS and Vue profiles | that each input changes the key | unit |
| `api/selective-load.ts` | 5 profiles, first-run branch only | new file → load; changed import graph → load; `always` for hooks, parameter types, World, timeout, wrapper, no-steps; undefined step → full plan; `literalPrefix` (a wrong prefix silently drops a step); non-compiling pattern; corrupt index; `abort()` writing nothing; skipped-file records surviving `finish()` | unit after exporting the matching helpers; e2e for the skipped count |
| `api/support-reloader.ts` | one CJS watch scenario (3 Enter-driven runs) | the "registered something" observation; the five contributors to the re-evaluate set; `kept > 0`; `abort()` after a failing load; the ESM `?tsflow=<n>` rerun (not in the matrix at all) | unit with stubbed module-graph; e2e on `node-esm` |
| `api/register-loaders.ts` | every ESM profile, both hook modes | the `loaderHooksMode` truth table; the Phase 10 dedupe (a second load in one process must not stack hooks) | unit |
| `api/support.ts` | every run | `composeRecorders`; `getSupportCodeLibrary` twice in one process (idempotency); the `boolean` parameter type surviving a reload | unit |
| `api/run-cucumber.ts` | every run, parse-error-free | envelope buffering and replay order (`meta`, Gherkin, support code); the parse-error path; failure-path spinner cleanup; `alreadyLoaded` | e2e with a deliberate parse-error feature; unit for `describeTranspileCache` |
| `utils/startup-progress.ts` | plain (non-TTY) text only, via one regex in the watch spec | the stall / relief state machine, heartbeat, message self-clear, `{done}/{left}/{total}/{elapsed}` substitution, `rows()` on wrapped and emoji lines, worker-timeout fallback, `TSFLOW_THEME=off`, `describeTranspiler` for all eight names | unit (`PhaseRenderer` already injects `write`, `theme`, `mode`, `columns`); needs a clock seam for `performance.now()` |
| `utils/startup-progress-worker.ts` | nothing (TTY only) | `openTerminal` fallback on a bad descriptor; the end handshake | one small unit test; the rest stays with the `verify-console-output` skill |
| `utils/tsflow-timing.ts` + `.mjs` | nothing (unset in every profile; the watch spec deletes it) | phase accumulation, `mergeSection` scope nesting, the snapshot-drain contract between the twins, the loader-port timeout, `resetTimings()`, `normalizeFile` folding `file:` URLs and case, report layout | unit (`printTimingReport` already takes a stream) |
| `cli/watch.ts` | one CJS scenario, Enter only; file watching never runs | `onFileEvent` classification; the 200 ms debounce; rerun queued while running; `UNKNOWN_CHANGE`; watcher add and drop; the child argv rewrite and `--no-watch`; quitting mid-run; a failing run not stopping the loop; `formatBytes` | unit after extracting the argv rewrite and the classifier; e2e that edits a file and asserts the `Changed:` line |
| `bindings.ts` / `bindings.mjs` | every workspace imports the entry point | export-name parity between the twins; the root barrel not loading `./cli` | unit |
| `transpilers/esm/loader-utils.mjs`, `esm/esbuild.mjs` | 6 ESM profiles | `isRequire` (a regression breaks every CJS load on sync-hooks Node); resolution caches and their reset; `withoutQuery` against `?tsflow=`; `compilePathMappings` / `rewritePathMappings` | unit for the pure helpers; e2e for the hooks |
| `api/load-configuration.ts` | transpiler switch on every run | env-versus-option precedence for `transpileCache` and `selectiveLoad`; the `parallelLoad` notice | unit (takes an environment object) |
| `utils/our-callsite.ts` | reports on every run, unasserted | `withoutBrowserDetection` restoring the descriptor; `traceLoaderMap` with and without a mapping; cwd-relative `uri` on both separators | unit |

Seams to add before the corresponding tests, each a small extraction rather than a redesign: export the
selective-load matching helpers (`literalPrefix`, `patternKey`, `storedPattern`, `matches`, the first-word
bucketing) out of the 525-line module; an injectable index path or file functions on `SelectiveLoadSession`;
injectable module-graph functions on `SupportReloader`; a clock on `PhaseRenderer` and `StartupProgress`; an
injectable worker factory on `StartupProgress`; `childArgs()` and `isWatchableEvent()` extracted from
`WatchSession`; an injectable `require.cache` for the CJS walkers in `module-graph`; a cwd parameter and a memo
reset for `getCacheRootDirectory()`; a reset for the memoized state in `transpile-cache.ts`, `register-loaders.ts`
and the theme resolution.

### Review findings for strand 2

Recorded before anything changes, one line each, for pruning with the owner. Letters are stable identifiers.

- **A.** `--parallel-load` is still declared (hidden) in `cli/argv-parser.ts` and carried through five type declarations (`argv-parser.ts`, `runtime/types.ts` twice, `api/convert-configuration.ts`, `api/load-support.ts`) for a feature removed in Phase 8; only the notice in `load-configuration.ts` reads it.
- **B.** `IMessageData.coordinates` (`runtime/types.ts`) is still sent to every parallel child and unused there since Phase 4.
- **C.** `TranspileCacheStats.enabled` and `.directory` are produced on every call and read by no caller; `isTimingEnabled()` is exported from both timing twins and called by nobody; `selectiveLoad` is resolved from `TSFLOW_SELECTIVE_LOAD` but, unlike `transpileCache`, not written back to the environment, and the asymmetry is undocumented at the call site.
- **D.** Module eviction and the dependent closure exist twice: `api/load-support.ts` (`evictChangedAndDependents`, `evictAllSupportModules`, CJS only, registry-unaware, what `reload-support-test.feature` tests) and `utils/module-graph.ts` (`dependentProjectModules`, `evictRequiredModules`, what `--watch` uses). `reloadSupport()` never calls `BindingRegistry.clear()` or `notifyReload()`; `SupportReloader.prepare()` does. Highest-value consolidation on the branch. **(large)**
- **E.** Path normalization in four places: `canonicalPath` (`module-graph.ts`), `normalizeFile` (`tsflow-timing.ts`, byte-identical logic), the cwd-prefix strip in `our-callsite.ts`, and ad-hoc backslash replacement in `register-loaders.ts`, `startup-progress.ts` and `loader-utils.mjs`.
- **F.** File stamping in two shapes: `stampOf()` → `[mtimeMs, size]` in `selective-load.ts` and `{ size, mtimeMs }` in the transpile-cache prune scan.
- **G.** Nine caches with no shared policy or reset and no written rule for which participate in the watch-mode reset (only the two resolution caches in `loader-utils.mjs` do, via `addReloadListener`). Document the rule in Architecture.md rather than unify the caches.
- **H.** Two `supports()` with the same name and opposite rules (`transpilers/esbuild.ts` accepts `.ts`, `esm/esbuild.mjs` rejects it), and two `transpileCode()` with the same signature, different `format` defaults and different cache kinds.
- **I.** Two alias-rewriting passes: `rewritePathMappings` over the source (`esm/esbuild.mjs`) and `transformImports` over compiled Vue output (`loader-utils.mjs`), the second running on cached output every time.
- **J.** The decorator mode reaches the transpilers three ways: `global.experimentalDecorators` read at module load (`transpilers/esbuild.ts`), the same global read per call (`vue-sfc-compiler.ts`), and `CUCUMBER_EXPERIMENTAL_DECORATORS` read at module load (`esm/esbuild.mjs`, `esm/tsnode-loader.mjs`). Only the environment form crosses a thread or process boundary, and the Vue cache key is built from the global form, so it is one ordering change away from a stale-cache bug. Pass it as one value. **(large)**
- **K.** `SupportLoadRecorder.endFile(path, kind)` declares two parameters that neither implementation accepts; `composeRecorders` forwards them.
- **L.** The startup phase id is `'assemble'` while every document, comment and theme title calls it "parse".
- **M.** `watch` is the only option that lives on the flat configuration and is read by `Cli.run()` rather than converted into the run configuration; `--no-watch` exists only for the child-process fallback, which no test reaches.
- **N.** The `node` workspace's profile named `watch` does not set `watch: true`; the spec passes `--watch`, so "a profile turns on watch mode" is untested from both ends.
- **O.** `TSFLOW_TIMING` — decided above: keep and test.
- **P.** `bin/cucumber-tsflow.js` enables Node's compile cache, measured neutral in Phase 4; the hand-off called it a review decision. Decide with measurement on the UIS suite or by reading Phase 4's numbers again.
- **Q.** The root `lint` script runs the whole test matrix; make it a lint gate and add `typecheck` beside it.
- **R.** ESLint `no-undef` cannot see the Node global types; `cli/index.ts` and `vue-jsdom-setup.mjs` carry disables. Turn `no-undef` off for TypeScript files and let `tsc` own the check.

Added by the 12a test work (see [Stage 12a hand-off](#stage-12a-hand-off)); S and T were fixed there because the tests that found them could not otherwise be green:

- **S.** *(fixed in 12a)* `bindings.mjs` and `wrapper.mjs` exported `StartTestCaseInfo`, `EndTestCaseInfo` and `ScenarioContext`, which are interfaces, as runtime values equal to `undefined`; the export-parity test found the three names present in the ESM twins and absent from the CommonJS builds. The lines were removed; a consumer whose tsconfig preserves value imports of these types would now fail at link time instead of receiving `undefined`.
- **T.** *(fixed in 12a)* `patternKey()` in `api/selective-load.ts` keyed a flagless regular expression and a Cucumber expression with the same source identically (`flags ?? ''`), so the second one registered was matched with the first one's compiled expression and its file could be skipped although a selected step matched it. The key now carries the pattern kind.
- **U.** `getSupportCodeLibrary()` leaves eviction to its callers: a second call in one process finds the CommonJS support files cached and builds a library with no step definitions. `reloadSupport()`, `SupportReloader` and the parallel children each handle it in their own way; this is the mechanism behind finding D and a candidate to resolve with it. The unit test `support.test.ts` records the current contract.
- **V.** `SupportLoadRecorder.endFile(path, kind)` declares two parameters that neither implementation accepts (finding K); the unit tests had to call `endFile()` on the classes with no arguments to type-check. Resolving K settles which signature is meant.
- **W.** The fixture support files under `test/fixtures/support/` need a `package.json` with `"type": "commonjs"` (ts-node classifies a `.ts` file's module type from the nearest package scope, and the test tree is `"type": "module"`) and are excluded from `test/tsconfig.json` (their ES import syntax in a CommonJS scope is what the transpiler under test handles); ESLint's project service therefore reports them as not found. The 12d lint pass needs an ESLint configuration for `cucumber-tsflow/test/` that either ignores the fixtures or gives them a project.
- **X.** In the `TSFLOW_TIMING` file-totals table the `main` family counts the main process and its `esm-hooks` scope as two contexts, so `contexts` reads 2 for a serial run with an in-thread loader that reported hook timings. Cosmetic; note whether that is the intended reading when the report layout is next touched.

### Stages and gates

Phase 12 was too large for one gate, so the owner split it into six stages. "Phase 12" stays the umbrella name;
each stage ends with a green gate, a hand-off section in this document written like the earlier phases' (state
of the tree, what landed, measured effect, notes for the next stage), and a pause where the owner reads the
hand-off and decides whether to continue. The stages contain everything from the [Phase 12 scope](#phase-12-scope)
plus eight additions raised in the baseline session as "what else belongs in a release gate", all accepted; the
additions are marked **(added)** below.

#### 12a: Test foundation

- The runner: `cucumber-tsflow/test/**/*.test.ts` run by `node --test`; `chai` and `@types/chai` declared on the
  `cucumber-tsflow` workspace at the versions the spec workspaces already use; a `test:unit` script at the root and
  a CI step after `yarn build`.
- Zero-seam unit tests: argv parser, module graph, builder fingerprint, transpile cache, the three cache-key
  strings, timing merge and report, bindings export parity.
- The seams listed under the coverage inventory, then the tests for the scope's risk list: selective-load
  matching and fallbacks (risk 1), transpile-cache invalidation completed (2), `SupportReloader.prepare()` with
  stubbed module-graph (4), `PhaseRenderer` stall and relief with a clock, `getSupportCodeLibrary` twice in one
  process and the `registerLoader` dedupe (6).
- **(added) CI matrix.** The package declares Node `>=22.0.0`, but CI runs Node 24 on Ubuntu only and every
  measurement and manual check on this branch was on Windows. `registerHooks` (Node 22.15) and
  `enableCompileCache` (22.8) may be absent on the declared floor, and the `module.register()` fallback has only
  ever been exercised by hand. Add a matrix of Ubuntu and Windows, Node 22 and 24, and one job with
  `TSFLOW_ESM_HOOKS=async`. CI's `actions/checkout@v2` and `actions/setup-node@v1` are old majors; update them in
  the same edit. This goes first so every later stage is validated on the matrix.

**Gate:** `test:unit` and `test:all` green on the full matrix; every risk 1–6 has a test. **Pause:** the review
findings A–R are pruned with the owner, with the tests open beside them; nothing in 12c is decided before this.

**Status: landed 2026-09-22, awaiting the owner's review and the pause.** See [Stage 12a hand-off](#stage-12a-hand-off).

#### 12b: Behavior discovery

- Three new spec scenarios: an ESM watch rerun on `node-esm` that edits a support file and asserts the
  `Changed:` line, the `(rerun N: … other modules)` note and a passing rerun (risk 3); a selective-load second run
  asserting `N of M support files … (K skipped)` with a `--no-selective-load` control; a deliberately malformed
  feature in a workspace no other profile globs, for the parse-error path and envelope order (risk 5). Each needs
  the right tags so only the intended workspaces pick it up.
- **(added) Failure-path pass.** In normal and watch mode, on CJS and ESM: a syntax error in a support file, a
  missing import, a `BeforeAll` that throws, a feature that fails to parse, and Ctrl-C mid-run. Check that the
  message names the file, that the spinner worker and the message line shut down cleanly, that stdin leaves raw
  mode, that the exit code is right and that a watch session survives a failing run. This stage finds things
  rather than fixes them: each finding becomes a test, a fix queued for 12c, or a closed entry with a reason.

**Gate:** `test:all` green with the new scenarios on the matrix; no failure-path finding left unclassified.

#### 12c: Review refactors

- The pruned findings list, one concern per commit, small ones first, D and J last since they touch the most.
  Fixes queued from 12b land here too.
- **(added) Closing measurement.** After the last refactor, measure the UIS suite (`dim` and the full suite,
  fresh process and one `--watch` rerun) against the Phase 10 clean reference, following the Phase 11 note about
  stray filesystem scanners first.

**Gate:** the findings list fully resolved (landed or closed with a reason); unit tests and the matrix green after
every commit; the UIS numbers within noise of Phase 10. **Pause:** the measurement. If it moved, stop and look
before touching anything else.

#### 12d: Housekeeping sweeps

- The 21 strict errors, then `strict: true` in `tsconfig.json`; a `typecheck` script covering `src` and `test`;
  the root `lint` script made a lint gate (finding Q); `no-undef` off for TypeScript files (finding R).
- The spelling pass over `src` and the 15 documents: scripted, then read. Identifiers renamed only after checking
  the `exports` map and the spec workspaces. Placed after 12c so renames do not churn under review.
- **(added) Dependency audit.** `import-sync` and `tslib` are imported nowhere under `src` or `bin`; `@types/node`
  is a runtime dependency; `jsdom` is reached only through `jsdom-global`. Decide each: remove, move to
  devDependencies, or keep with a stated reason. `yarn npm audit` in the same pass.

**Gate:** `typecheck` and `lint` clean with no new disables; zero British spellings in `src` and the documents;
every dependency decided.

#### 12e: Documentation and packaging

- `docs/performance-and-diagnostics.md` from the 94-line README block, including **(added) cache operations**:
  where the transpile cache and the selective-load index live, how to clear them, and whether the index is
  bounded the way the transpile cache is (512 MB, oldest first). Document only; a `--clear-cache` flag is new
  feature scope and not part of this phase.
- The root README reduced to one paragraph that links to the guide, with LF corrected to CRLF;
  `cucumber-tsflow/README.md` produced by the build from the root README.
- Architecture.md and CHANGELOG read as one product, not as a sequence of phases.
- **(added) Contributor documentation.** CONTRIBUTE.md still says `yarn test` runs unit tests with chai, which is
  wrong today. Bring it and CLAUDE.md (the command table, the build rules, "things that bite") up to the new
  scripts and the post-refactor shape.
- **(added) Repeatable benchmark script.** A root script that runs one spec workspace under `TSFLOW_TIMING` with
  a fixed profile and prints the report, with reference numbers recorded in the guide. Not a CI gate, since CI
  machines vary; it gives the next person a baseline without the UIS link.
- **(added) Packed-tarball smoke test.** `npm pack` the workspace, install the tarball into a temporary CJS
  project and a temporary ESM project, run one feature in each: the only check of the `exports` map, the
  `bindings/index.d.ts` stub and type resolution as a consumer sees them, and of the `files` list leaking nothing
  dev-only.

**Gate:** the tarball runs a feature in fresh CJS and ESM projects; the owner has read the guide and the README
paragraph; CONTRIBUTE.md and CLAUDE.md match the scripts.

#### 12f: Release

- **(added) Release checklist**, written before this stage starts: the version decision (the `[Unreleased]`
  section deprecates but removes nothing, which reads as a minor release, but the scenario-context lookup change
  under "Changed" is a behavior change the owner should weigh), the CHANGELOG date and heading, the tag, and how
  publish runs (`@jsdevtools/npm-publish` is in the root devDependencies; check for a publish workflow).
- **(added)** Real-console verification of the startup output with the `verify-console-output` skill, after the
  `colour` → `color` renames in `utils/startup-progress.ts`.
- A final `test:all` on the matrix, then tag and publish.

**Gate:** the checklist has no open box.

### Exit criteria, amended

The [exit criteria](#exit-criteria) above stand, gathered here with the additions: `yarn build` clean; `yarn
test:unit` and `yarn test:all` green on the Ubuntu and Windows, Node 22 and 24 matrix including the
`TSFLOW_ESM_HOOKS=async` job; `typecheck` clean with `strict` on; `yarn lint` clean without new disables; no
British spellings in `cucumber-tsflow/src` or the root and research documents; the review findings list fully
resolved; the failure-path pass with no open finding; the UIS closing measurement within noise of the Phase 10
reference; `docs/performance-and-diagnostics.md` exists and the root README's only performance content is the
paragraph that links to it; `cucumber-tsflow/README.md` byte-identical to the root README after `yarn build`;
Architecture.md, README, CHANGELOG, CONTRIBUTE.md and CLAUDE.md describe the product as it ships; the packed
tarball runs a feature in a fresh CJS and a fresh ESM project; the startup output verified on a real console; the
release checklist complete.

## Stage 12a hand-off

Written at the end of the 12a session (2026-09-22) so that the pause and 12b can start cold. Stage 12a is the test
foundation described under [Stages and gates](#stages-and-gates): the unit-test runner, the seams, the unit tests for
the risk list, and the CI matrix.

### State of the tree

- Branch `2026-09-speed-enhancements`. The Phase 12 baseline written in the previous session (decisions, coverage
  inventory, findings A–R, the six stages) is committed as `4604940`. The 12a work itself is **uncommitted** in the
  working tree for the owner's review, as Phase 10's was before its commit: `yarn build` clean, no stray `.js` under
  `src/`; `yarn test:unit` green (218 tests in 16 files, about 1.6 s on this machine); `yarn test:all` green on all
  sixteen variants on the same build, with the scenario counts unchanged since Phase 10 (18, 18, 20, 20, 18, 18, 15,
  15, 30, 30, 30, 30, 31, 31, 27, 27).
- `npx tsc -p test/tsconfig.json` (from `cucumber-tsflow/`) is clean with `strict`, `verbatimModuleSyntax` and
  `erasableSyntaxOnly` on. `npx tsc --noEmit -p tsconfig.node.json --strictNullChecks` reports nothing in the touched
  source files (the pre-existing 21 errors stand). `npx eslint cucumber-tsflow/src` is unchanged (0 errors, the
  generated `version.ts` warning); `npx eslint cucumber-tsflow/test` passes every test file and fails only on the two
  fixture support files (finding W). Prettier is clean on every file added or touched, all CRLF.
- Files added: `cucumber-tsflow/test/` — `package.json` (`"type": "module"`), `tsconfig.json`, `helpers/temp.ts`,
  `fixtures/timing-worker.mjs`, `fixtures/support/{package.json,steps-a.ts,steps-b.ts}`, and the test files
  `cli/argv-parser`, `utils/module-graph`, `utils/tsflow-timing`, `utils/startup-progress`, `api/builder-fingerprint`,
  `api/selective-load`, `api/support-reloader`, `api/support`, `api/run-cucumber`, `api/register-loaders`,
  `api/load-configuration`, `transpilers/transpile-cache`, `transpilers/cache-keys`, `transpilers/esm/loader-utils`,
  `bindings-exports` and `bindings-light` (all `*.test.ts`; about 2700 lines with the fixtures).
- Files changed: `src/transpilers/transpile-cache.ts` (`getCacheRootDirectory(cwd)`, memoized per working directory;
  `resetTranspileCacheDirectory()`), `src/api/selective-load.ts` (`storedPattern`, `patternKey`, `literalPrefix` and
  `StoredPattern` exported; an optional `indexDirectory` constructor parameter; the finding T fix),
  `src/utils/startup-progress.ts` (a `now` clock on `PhaseRenderer`; `StartupProgressOptions` with `now`,
  `createWorker` and `handshakeTimeoutMs`; `SpinnerWorkerHandle`, the part of a `Worker` the class uses),
  `src/api/register-loaders.ts` (`registeredLoaders()`, read-only), `src/bindings.mjs` and `src/wrapper.mjs` (finding
  S), `cucumber-tsflow/package.json` (`chai` and `@types/chai` as devDependencies at the spec workspaces' versions;
  the `test:unit` script), `cucumber-tsflow/tsconfig.json` (`./test` excluded so the base configuration keeps
  describing `src`), the root `package.json` (`test:unit`), `yarn.lock`, `.github/workflows/ci.yml` (the matrix),
  `CLAUDE.md` (the command table and the note on where the tests are), `CHANGELOG.md` (two `Fixed` entries for S and
  T) and this document.

### What 12a landed

- **The runner.** `yarn test:unit` runs `node --test "test/**/*.test.ts"` in the `cucumber-tsflow` workspace: Node's
  built-in runner over TypeScript test files that Node strips itself, one process per file, importing the built
  `lib/` (so `yarn build` first, as for every other test script) and asserting with `chai`. The test tree is an ES
  module scope of its own (`test/package.json`), which is why the fixtures that must load as CommonJS carry a
  `package.json` of their own. `test/tsconfig.json` type-checks the tests as the editor sees them: `strict`,
  `nodenext`, `allowJs` so the `.mjs` twins have types, `verbatimModuleSyntax` and `erasableSyntaxOnly` so nothing
  Node cannot strip gets in. CJS modules are imported by their default (the module object) and destructured, which is
  what Node's interop gives and what TypeScript types; types come from `lib/*.d.ts`, never from CucumberJS's deep
  paths, which `nodenext` refuses to resolve from an ESM file.
- **The seams**, kept to what the tests needed: the cache root takes a working directory and can be reset, so the
  `node_modules` → `package.json` → temp directory walk is tested on temp trees; the selective-load session takes an
  index directory, so a test never touches the project's index; the renderer and the progress class take a clock, so
  the 30-second heartbeat, the stall and the five-unit relief streak are tested in milliseconds; the progress class
  takes a worker factory and a handshake timeout, so the end handshake and its fallback are tested without a thread;
  `register-loaders` exposes what it has attached. Not added, and why: an injectable `require.cache` for the
  module-graph walkers and a stubbed module graph for `SupportReloader`, because real temporary CommonJS files
  required through `createRequire` and real recorded ESM edges test the same code paths with nothing faked; the
  `childArgs()` / `isWatchableEvent()` extractions from `WatchSession`, because `cli/watch.ts` is 12b's end-to-end
  ground and its unit seams can wait for what 12b finds.
- **The tests against the risk list.** (1) `selective-load.test.ts` drives `SelectiveLoadSession` through eleven
  consecutive runs over one index: first run, matching by Cucumber expression and by global regular expression, a step
  registered straight with CucumberJS, hooks and set-up files always loading, every-file-needed, no-match full plan
  with the step text in the reason, a new file, a pattern that does not compile, a changed import graph and the
  rewritten record afterwards, a skipped file's record surviving, parameter types recorded and used, a corrupt index,
  `abort()` writing nothing, plus a `literalPrefix` table and the "never excludes a matching text" check.
  (2) `transpile-cache.test.ts` covers hit, miss on each input, field boundaries in the key, entries of another format
  or without a value, an unwritable directory, the `TSFLOW_TRANSPILE_CACHE=false` bypass, pruning order with a stray
  temp file, and the directory walk; `cache-keys.test.ts` checks that each of the three transpilers' key strings
  changes with every input it promises to cover, including the decorator mode read three different ways (finding J,
  now with a test on each way). (3) Watch mode's versioning, eviction and reverse closure are covered in
  `module-graph.test.ts` and `support-reloader.test.ts`; the second and third run end to end, on ESM, stay with 12b as
  planned, with the existing CommonJS watch spec covering the CJS side. (4) `support-reloader.test.ts` runs one
  reloader through ten generations: observe-only first run, re-evaluate what registered, a changed module and its
  requirers, a new file, registration seen through the builder alone, a file dropping back to kept, a
  decorator-applying helper re-evaluated every run, a late registration noticed at the next `prepare()`, `abort()`
  forgetting a changed file, and `watchedFiles()`; plus the ESM `?tsflow=<n>` versioning and `unsupportedReason`.
  (5) `run-cucumber.test.ts` runs `runCucumber` in-process on the es-node transpiler with the fixture support files
  and checks the envelope order (`meta`, `source`, `gherkinDocument`, `pickle`, then the support code, then the run)
  and the parse-error path (support loaded, `parseError` emitted, nothing run, `success: false`). (6) `support.test.ts`
  loads the decorated fixtures through ts-node twice with eviction in between and asserts an equal library, records
  the no-eviction behavior (finding U), and checks the registry's callsite patching through real source maps;
  `register-loaders.test.ts` covers the `loaderHooksMode` truth table and attaches a loader twice.
- **The zero-seam tests.** `argv-parser` (the paired `--x` / `--no-x` declarations, collectors, tag merging, JSON
  merging and its errors, count validation, the hidden `--parallel-load`), `module-graph` (canonical paths on both
  platforms, `isProjectModule` including the library-root and sibling cases, recorded edges with cycles, the reverse
  closure over both module systems on real temp files, versioning with foreign and stale queries, edge forgetting,
  reload listeners), `builder-fingerprint` (each of the six fields), `tsflow-timing` (accumulation, nested scopes,
  snapshot copies, the report layout, file identity folding across URL, separator and case, and the loader-port
  contract against a real worker thread including the drain and the timeout), `startup-progress` (both renderer modes,
  the heartbeat and relief state machine, message self-clear, row counting with emoji and escapes, the width used for
  the cursor-up count, `describeTranspiler` for all eight names, themes, `plural`), `load-configuration`
  (environment-versus-option precedence for both options, the `parallelLoad` notice from either source, decorator
  mode publication, the transpiler switch, format aliases, path clearing), `loader-utils` (`isRequire`, extension
  probing and its cache reset, common file types, `loadTypeScript` keeping its map, the hooks' require passthrough,
  edge recording and version application), and the two export-parity files (twins equal by name and value, the root a
  superset of `bindings`, the CLI not loaded by the root, nothing heavy loaded by `bindings` alone).
- **The CI matrix.** `ci.yml` now runs Ubuntu and Windows × Node 22 and 24, plus one Ubuntu/Node 24 job with
  `TSFLOW_ESM_HOOKS=async` (declared through a `hooks` matrix dimension so the `include` entry is a fifth job rather
  than a merge into an existing one), on `actions/checkout@v4` and `actions/setup-node@v4`, with `yarn test:unit`
  between the build and the spec matrix and `fail-fast: false`. A `workflow_dispatch` trigger was added so the
  matrix can be run by hand on this branch: the workflow's push and pull-request triggers are still `master` and
  `release/**` only, so **the matrix has been written but not yet executed**; nothing in this session ran on GitHub.
  Two things to watch when it first runs: the unit tests need Node's default type stripping, which arrived in 22.18,
  so `node-version: '22'` must keep resolving to a current 22.x (it does today); and the async job sets the variable
  to an empty string on the other jobs, which every reader compares with `=== 'async'`.
- **Found on the way, fixed, with tests as the net:** findings S and T above, both in the `CHANGELOG` under `Fixed`.
  Found and recorded for the pause: U, V, W, X.

### Notes specific to the pause and 12b

- The gate is met as far as this machine can tell: `test:unit` and `test:all` green here, every item on the risk
  list has a test, with 3 (ESM watch reruns end to end) and 5's end-to-end form deliberately left to 12b's scenarios.
  The owner's review of the uncommitted tree and the pruning of findings A–X come next; nothing in 12c is decided
  before that.
- Running one test file: `node --test test/api/selective-load.test.ts` from `cucumber-tsflow/` after `yarn build`.
  Each file is its own process, so module-level state (the timing store, the module graph, the transpile-cache
  directory, the binding registry) is isolated between files but shared within one; the files that depend on order
  say so in comments. Temp directories come from `test/helpers/temp.ts` and are removed when the file ends.
- Two files use the project's real transpile cache under `node_modules/.cache/cucumber-tsflow/transpile`, because
  they load the fixtures through the es-node transpiler like a real run: `api/support.test.ts` and
  `api/run-cucumber.test.ts`. Every other transpile in the tests is redirected with `TSFLOW_TRANSPILE_CACHE_DIR`.
- `register-loaders.test.ts` really attaches the esnode loader to its process (in-thread here, on the hooks thread
  under the async CI job), which is why that test is last in its file.
- For 12b's scenarios: `run-cucumber.test.ts` shows how to drive a whole run in-process with a captured stdout and
  the envelope stream, which may be a quicker vehicle for the parse-error ordering check than a spec workspace; the
  stage text asks for a spec scenario in a workspace no other profile globs, and that remains the plan for the
  user-visible form.
- Build with `yarn build`, never bare `tsc`; run `yarn test:unit` and `yarn test:all` before calling a stage done.
