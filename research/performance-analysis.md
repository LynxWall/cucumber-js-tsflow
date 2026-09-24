# Performance Analysis

An analysis of `@lynxwall/cucumber-tsflow` for performance improvement opportunities, ordered by impact.
Findings come from reading the runtime, bindings, loader and transpiler layers, plus isolated
microbenchmarks of the hot paths.

## Method and caveats

The spec matrix could not be run end to end while preparing this: the checked-in `cucumber-tsflow/lib/`
was stale and failed to resolve `@cucumber/cucumber/lib/cli/helpers.js` against the installed version,
so a `yarn build` is required first. The numbers below come from isolated benchmarks driven against the
built `lib/runtime/utils.js`, which is current for that file. Everything else is source reading.

The spec suite is only 28 scenarios across 8 feature files, so it would not have exposed the scaling
behavior described here regardless. The costs below matter for real-world suites in the hundreds of
scenarios.

## Tier 1 — the step-lookup hot path

This is where the large majority of avoidable runtime cost lives. It scales superlinearly with suite
size, so it is invisible on small suites and dominant on large ones.

### 1. `getStepScenarioContext()` rescans the entire suite for every step

[`message-collector.ts:211-238`](../cucumber-tsflow/src/runtime/message-collector.ts) walks the entire
`pickleMap` — every scenario in the whole run, not just the one currently executing — and for each step
of each pickle calls [`hasMatchingStep`](../cucumber-tsflow/src/runtime/utils.ts), which runs 14 chained
`String.replace()` passes and constructs a `new RegExp()` on every single comparison.

It is also invoked twice per step:

1. By the step trampoline in [`binding-decorator.ts:147`](../cucumber-tsflow/src/bindings/binding-decorator.ts)
1. By the runner in [`test-case-runner.ts:329`](../cucumber-tsflow/src/runtime/test-case-runner.ts)

Measured with an isolated replica of the scan against the built `lib/runtime/utils.js`, with the matching
step placed at the worst-case position:

| Suite shape              | Total lookup cost | Per step lookup |
| ------------------------ | ----------------- | --------------- |
| 10 scenarios x 10 steps  | 21 ms             | 0.21 ms         |
| 50 scenarios x 10 steps  | 489 ms            | 0.98 ms         |
| 200 scenarios x 10 steps | 8.5 s             | 4.23 ms         |
| 500 scenarios x 10 steps | 51.9 s            | 10.38 ms        |

Those figures are for one call site. With both call sites, a 500-scenario suite spends roughly 100
seconds resolving scenario context before running a single line of user step code.

Three fixes, in increasing order of payoff, measured at the 200 x 10 shape:

| Approach                                              | Time                |
| ----------------------------------------------------- | ------------------- |
| Current behavior                                     | 8114 ms             |
| Memoize pattern to `RegExp` in a `Map`                | 153 ms (53x faster) |
| Direct lookup of the context the runner already holds | 1 ms                |

The memoization is the safe immediate win — roughly ten lines, no API change, no behavioral difference
since the pattern-to-regex translation is pure.

The real fix is that both call sites already know the answer. `TestCaseRunner` holds `this.pickle`, and
`MessageCollector.startTestCase()` has just created that pickle's `ManagedScenarioContext`. Tracking the
running pickle's context in a field — set in `startTestCase`, cleared in `endTestCase` — turns this into
an O(1) field read and removes the pattern matching entirely. This is the same shortcut
`getHookScenarioContext()` already takes by looking up `pickle.id` directly.

### 2. `hasMatchingTags` re-lowercases the tag array per parser token

[`utils.ts:31-33`](../cucumber-tsflow/src/runtime/utils.ts) places `tags.map(tag => tag.toLowerCase())`
inside the predicate callback handed to `lep.parse`, so the whole array is re-mapped for every token
the expression parser evaluates. Hoisting the lowercased array above the `parse` call is a one-line fix.

## Tier 2 — per-step allocations in `TestCaseRunner`

### 3. Step-hook definitions are re-filtered on every step

[`test-case-runner.ts:103-114`](../cucumber-tsflow/src/runtime/test-case-runner.ts) —
`getBeforeStepHookDefinitions()` and `getAfterStepHookDefinitions()` filter the support library by
`appliesToTestCase(this.pickle)` on every step, and the "after" variant additionally allocates through
`.slice(0).reverse()` each time. The pickle is fixed for the runner's entire lifetime, so both lists can
be computed once in the constructor.

### 4. Linear definition lookups per step and per hook

[`test-case-runner.ts:376-384`](../cucumber-tsflow/src/runtime/test-case-runner.ts) —
`findHookDefinition` builds a fresh concatenated array of all before and after hook definitions on
every hook step, then linear-scans it. `findStepDefinition` linear-scans `stepDefinitions` per step.
Building `Map<id, definition>` indexes once per run removes both.

## Tier 3 — startup and load

### 5. `updateSupportCodeLibrary` is O(bindings x definitions)

[`binding-registry.ts:231-258`](../cucumber-tsflow/src/bindings/binding-registry.ts) uses
`definitions.find(s => s.options.cucumberKey === key)` for every registered binding. With 1000 bindings
against 1000 step definitions that is roughly a million comparisons at every startup — including inside
each forked worker process in parallel mode. Building the key-to-definition maps once up front makes it
linear.

It is also applied twice to the same library when the programmatic API is used:
[`load-support.ts:88`](../cucumber-tsflow/src/api/load-support.ts) followed by
[`run-cucumber.ts:145`](../cucumber-tsflow/src/api/run-cucumber.ts).

### 6. `registerStepBinding` dedupes with linear scans

[`binding-registry.ts:133`](../cucumber-tsflow/src/bindings/binding-registry.ts) and the same file at
line 149 both use `Array.some()` to check for an existing identical binding, making registration
quadratic in the number of bindings per pattern group and per class. The `_cucumberKeyIndex` map already
exists; a composite `filename:line:tags:pattern` key set would make both checks O(1).

### 7. Parallel preload appears to warm a cache that does not exist

[`parallel-loader.ts:4-10`](../cucumber-tsflow/src/api/parallel-loader.ts) documents the phase as warming
a transpiler "on-disk cache" so that the main thread's authoritative load hits warm caches. Three
observations suggest no such cache exists on the esbuild path:

- [`esbuild-transpiler.ts`](../cucumber-tsflow/src/transpilers/esbuild-transpiler.ts) calls
  `transformSync` in memory and writes nothing to disk.
- `ts-node-maintained` has no disk cache. Running
  `grep -c cacheDirectory node_modules/ts-node-maintained/dist/index.js` returns `0`.
- Worker threads have separate module registries, so nothing loaded in a worker carries into the main
  thread.

If that holds, `parallelLoad: true` — which every spec profile in `cucumber-tsflow-specs/*/cucumber.json`
sets — pays for thread spawn plus a full transpile of the support tree, after which the main thread
transpiles everything again from scratch.

This should be confirmed with a timed A/B run before acting on it. If confirmed there are two paths:

1. Drop the preload phase.
1. Make it real by adding a content-hash-keyed on-disk cache inside
   [`transpileCode`](../cucumber-tsflow/src/transpilers/esbuild.ts). This would also benefit parallel
   execution, where every forked child process currently re-transpiles the entire support tree
   independently.

### 8. `module.enableCompileCache()` is unused

Node 22 is already the minimum supported version, and it provides a real cross-process V8 code cache
from a single call in the CLI entry point. This is the cheapest genuine win available for the
fork-per-worker parallel path, where each child process currently recompiles everything.

## Tier 4 — smaller and conditional

- ESM resolution performs up to 14 uncached `existsSync` calls per specifier.
  [`loader-utils.mjs:66-107`](../cucumber-tsflow/src/transpilers/esm/loader-utils.mjs) tries every code
  extension and then every index file, hitting the filesystem synchronously each time, on every resolve.
  The same file already has a `pathResolutionCache` for tsconfig path mapping; the same pattern applies.

- `transformImports` rescans the whole source per import.
  [`loader-utils.mjs:233`](../cucumber-tsflow/src/transpilers/esm/loader-utils.mjs) uses
  `transformed.replace(originalImport, newImport)`, which is O(source x imports) and replaces only the
  first occurrence — so a repeated import statement can rewrite the wrong one. Rebuilding from the
  `matchAll` indices fixes both the cost and the correctness edge.

- `GherkinManager.loadFeatures` copies the accumulated array per path.
  [`gherkin-manager.ts:23`](../cucumber-tsflow/src/gherkin/gherkin-manager.ts) does
  `this.features = [...this.features, ...features]` inside the loop, which is quadratic. Only reached on
  the `--debug-file` path.

- JUnit name deduplication is quadratic.
  [`junit-bamboo-formatter.ts:161-171`](../cucumber-tsflow/src/formatter/junit-bamboo-formatter.ts) calls
  `Array.includes` inside a `while` loop to find a free suffix. A per-feature count map replaces it.

- Parallel work assignment allocates per candidate.
  [`adapter.ts:160-174`](../cucumber-tsflow/src/runtime/parallel/adapter.ts) rebuilds
  `Object.values(this.inProgress).map(...)` for every index it tries, and removes work with
  `todo.splice()`. This only bites when a custom `setParallelCanAssign` handler is installed, since the
  default returns true at the first index.

- Worker `INITIALIZE` ships the full message maps.
  [`adapter.ts:112-129`](../cucumber-tsflow/src/runtime/parallel/adapter.ts) sends every gherkin
  document, pickle and test case over IPC to each forked worker at startup, serialized per worker.

## Suggested order of work

1. Memoize the pattern-to-regex translation in [`utils.ts`](../cucumber-tsflow/src/runtime/utils.ts).
   Smallest change, roughly 53x on the dominant cost.
1. Track the running scenario context on `MessageCollector` and have both call sites read it directly.
   This removes the scan entirely.
1. Hoist the tag lowercasing in `hasMatchingTags`, and hoist the per-step hook filtering and definition
   lookups in `TestCaseRunner`.
1. Index `updateSupportCodeLibrary` and `registerStepBinding` by key.
1. Measure the parallel preload phase honestly, then either remove it or give it a real on-disk cache.
1. Add `module.enableCompileCache()` to the CLI entry.

Items 1 through 3 account for nearly all of the measured runtime overhead. Items 4 through 6 are startup
and load costs that are paid once per process, but in parallel mode that means once per worker.
