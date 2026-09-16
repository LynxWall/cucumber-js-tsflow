# Performance Enhancement Analysis 2

A review of all three performance investigations in this directory —
[performance-analysis.md](performance-analysis.md), [analysis-2.md](analysis-2.md) and
[analysis-3.md](analysis-3.md) — covering what each examined, which claims hold up against the current
source, and a graded assessment of each.

This supersedes [performance-enhancement-analysis.md](performance-enhancement-analysis.md), which covered
only the first two documents. That document is retained; its grades for the first two are carried forward
here unchanged, for the reason given under [Grades](#grades).

## Method

Every load-bearing claim in all three documents was checked against the current working tree. For
`analysis-3.md` that verification extended into `node_modules`, because a substantial part of its argument
rests on the internals of `ts-node-maintained` and `esbuild` rather than on tsflow's own source.

No benchmarks were re-run. Where a document reports measurements, those are treated as claims about method
rather than independently confirmed figures.

Grading is criterion-referenced, not curved. Each document is assessed against the same two standards —
quality of analysis, and impact of findings if acted on — rather than against each other.

## Scope map

| | `performance-analysis.md` | `analysis-2.md` | `analysis-3.md` |
| --- | --- | --- | --- |
| Phase examined | Step execution and registration | Pre-run: discovery, transpile, load | Pre-run: discovery, transpile, load |
| Cost model | Per-step, scaling with scenario count | Per-file, scaling with support-tree size and worker count | Same, plus a per-process multiplier table |
| Evidence base | Microbenchmarks plus source reading | tsflow source reading only | tsflow source **and dependency source** |
| Top finding | Full-suite rescan on every step lookup | No transpile cache exists anywhere | `parallelLoad` makes startup slower, not faster |
| Unique territory | The entire runtime hot path | `registerHooks()`, the barrel, a portability bug | ts-node bypass, load ordering, regex recompilation |

The structural situation is now: `performance-analysis.md` is the only document that examines runtime step
execution, and `analysis-3.md` covers the same ground as `analysis-2.md` at a consistently higher standard
of evidence. `analysis-2.md` is not made redundant, but it is reduced to three unique contributions
(detailed below).

### Corroboration across documents

Findings that appear in more than one document, reached independently:

1. **`parallelLoad` warms a cache that does not exist.** All three. This is now triply derived —
   `performance-analysis.md` item 7, `analysis-2.md` item 1, `analysis-3.md`'s
   "`parallelLoad` currently makes startup slower, not faster." It is the highest-confidence finding in
   the directory and the one most likely to be worth acting on immediately.
1. **`updateSupportCodeLibrary` is O(bindings x definitions).** `performance-analysis.md` item 5 and
   `analysis-3.md`. Both note that `_cucumberKeyIndex` in the same file already establishes the fix.
1. **`resolveWithExtensions` performs up to 14 uncached `existsSync` calls.** All three. All three also
   note that the adjacent `pathResolutionCache` establishes the pattern.
1. **`files: true` / `TS_NODE_FILES` is ESM-only waste.** `analysis-2.md` item 6 and `analysis-3.md`.
   Only `analysis-3.md` proves why (below).
1. **Parallel children re-glob paths the coordinator already holds.** `analysis-2.md` item 3 and
   `analysis-3.md`.
1. **Callsite capture belongs off the critical path.** `analysis-2.md` item 4 and `analysis-3.md`.
1. **Hot-path logger arguments allocate when logging is off.** `analysis-2.md` item 8 and `analysis-3.md`.
1. **`module.enableCompileCache()` is unused and available.** `performance-analysis.md` item 8 and
   `analysis-3.md`. Only `analysis-3.md` flags that its interaction with custom loaders must be measured
   rather than assumed.

## Verification results

The first two documents were verified in
[performance-enhancement-analysis.md](performance-enhancement-analysis.md); those results stand and are
summarised rather than repeated. This section concentrates on `analysis-3.md`, whose claims are new.

### `analysis-3.md` — confirmed, including its dependency-source claims

The dependency-internals claims are exact. This is worth stating precisely, because it is the basis for
the document's grade:

- **`ts-node`'s `files` option.** The quoted comment and code are verbatim from
  `node_modules/ts-node-maintained/dist/configuration.js` — the comment
  "Only used for globbing \"files\", \"include\", \"exclude\"" at line 215 and
  `readDirectory: files ? ts.sys.readDirectory : () => []` at line 217.
- **The dead-work proof.** `const rootFileNames = new Set(config.fileNames)` sits at
  `dist/index.js:368`, inside an `if (!transpileOnly)` branch opening at line 366. Every tsflow ESM
  service sets `transpileOnly: true`. So the recursive directory walk is computed and discarded, exactly
  as claimed. This is the single strongest piece of analysis in any of the three documents: it does not
  argue that the option is *probably* wasteful, it demonstrates that the result is unreachable.
- **The source-map round trip.** `dist/index.js:866-867` matches the quoted `base64Map` /
  `sourceMapContent` lines, and `updateSourceMap` at line 900 is indeed a `JSON.parse` followed by a
  `JSON.stringify`.
- **The stated version.** `ts-node-maintained` is 10.9.6, as the document says.
- **`transformSync` blocking.** `node_modules/esbuild/lib/main.js` starts a `worker_threads` service for
  sync calls (line 1882 onward) and blocks on `Atomics.wait(sharedBufferView, 0, 0)` at line 2140. The
  installed esbuild is 0.25.10, matching the version string the file checks internally.

The tsflow-source claims also hold:

- `rewritePathMappings` constructs `new RegExp(...)` inside a loop over every tsconfig path entry, on
  every file ([esbuild.mjs](../cucumber-tsflow/src/transpilers/esm/esbuild.mjs)). `tsnode-loader.mjs`
  does the same and additionally runs a `searchRegex.test(code)` full-source pass before the `replace()`
  pass, so the two-scans-per-alias-per-file claim is correct.
- `shortUuid().new()` appears at nine call sites across
  [step-decorators.ts](../cucumber-tsflow/src/bindings/step-decorators.ts) and
  [hook-decorators.ts](../cucumber-tsflow/src/bindings/hook-decorators.ts), constructing a fresh base58
  translator per binding rather than reusing one.
- Support code does load before pickles are known: `getSupportCodeLibrary` is called at
  `run-cucumber.ts:131` and `updateSupportCodeLibrary` at `:145`, while `getPicklesAndErrors` does not
  run until `:182`. The `--name "one scenario"` consequence follows directly.
- `reloadSupport()` exists at `load-support.ts:107` with delta-aware `require.cache` eviction and has no
  command-line surface, as claimed.
- `toDescriptors()` and `getDescriptorSourceFiles()` exist on the registry; there is no
  `fromDescriptors()` counterpart, so the preload descriptors genuinely cannot be hydrated.
- The hardcoded repository-path check is real:
  `if (!filename.includes('cucumber-tsflow-specs')) return false;` in `esbuild.mjs`'s exported
  `supports()`. The claim that it is currently dead is also correct — `supports` is exported from both
  `esbuild.mjs` and [esbuild.ts](../cucumber-tsflow/src/transpilers/esbuild.ts) and imported by nothing.
  Note that the CJS `esbuild.ts` version does **not** contain the specs check, so the two exported
  predicates disagree, which is a latent trap on its own.
- `compileVueSFC` does compile each template twice — a `parseOnly: true` pass to obtain the AST for
  `compileScript`, then the real compile
  ([vue-sfc-compiler.ts](../cucumber-tsflow/src/transpilers/vue-sfc-compiler.ts)).
- The preload thread cap is `Math.min(availableParallelism(), 4)`.

### A precision improvement over `analysis-2.md`

`analysis-3.md` states that `source-map-support` memoises by file, so the `SourceMapConsumer`
construction is once per support file rather than once per binding. This is correct —
`sourceMapCache[position.source]` in `node_modules/source-map-support/source-map-support.js` does exactly
that. `analysis-2.md` was ambiguous on this point: its body reads as though the parse is per decorator
call, while its summary correctly says "up to one source-map parse per support file." Same conclusion,
but `analysis-3.md` names the mechanism, which matters because it changes the size of the prize — the
stack walk is per binding, the map parse is per file.

### Corrections

- **`analysis-2.md`'s grep claim is wrong, and `analysis-3.md`'s is right.** `analysis-2.md` says a
  search for cache writes "returns exactly one unrelated hit in the Gherkin manager."
  [gherkin-manager.ts](../cucumber-tsflow/src/gherkin/gherkin-manager.ts) contains no cache references at
  all, and there are zero `writeFileSync` / `mkdirSync` / `createHash` occurrences anywhere in
  `cucumber-tsflow/src`. `analysis-3.md`'s version — "a search for cache writes finds only `require.cache`
  eviction in `reloadSupport()`" — is accurate.
- **`performance-analysis.md` item 5 undercounts.** It cites two `updateSupportCodeLibrary` call sites;
  there are three non-worker ones (`load-support.ts:88`, `load-support.ts:148`, `run-cucumber.ts:145`)
  plus `worker.ts:109`. The finding is strengthened.
- **`analysis-3.md` has minor line-number drift.** It cites `loader-utils.mjs:441-446` for the
  `await getLocalEsmHooks()` on every resolve; lines 441-446 are the `createEsbuildLoader` destructuring
  block, and the eager `await` is at line 462 inside the `resolve` hook. Likewise `run-cucumber.ts:177`
  for `getPicklesAndErrors`, which is at `:182`. Both findings are correct; only the anchors slipped.

### What remains unvalidated in `analysis-3.md`

- **No measurements of the real system.** This is the same gap the other two documents have, and
  `analysis-3.md` does not close it. Its Step 0 recommends a `TSFLOW_TIMING` mode precisely because the
  numbers do not exist yet.
- **The multiplier table is derived, not observed.** The 1 / 2 / 9 / 10 table follows correctly from the
  code, but it quantifies *repetitions*, not seconds. Whether ten cold transpiles is the dominant startup
  term or a minor one is exactly what Step 0 would answer.
- **Step 5's pattern index is speculative** and the document says so, listing the hooks, context classes
  and load-time-side-effect hazards and putting it behind a flag. That is the right handling, but it means
  the biggest claimed win for the everyday case is unproven.
- **The `enableCompileCache()` interaction with custom loaders is explicitly flagged as unknown.** Correct
  and honest, but it means `performance-analysis.md`'s presentation of the same item as a near-free win is
  the more optimistic of the two readings.

### What `analysis-2.md` still uniquely contributes

Three items appear in no other document and remain worth keeping:

1. **`module.registerHooks()`** (Node 22+) to run loader hooks synchronously on the main thread,
   eliminating loader-thread `postMessage` round trips and the structured-clone copying of transformed
   source. This is a real ESM-specific win that `analysis-3.md` misses entirely, and `analysis-2.md`
   correctly flags the async `loadVue` path as the complication.
1. **The public barrel drags in the CLI.** [index.ts](../cucumber-tsflow/src/index.ts) does
   `import { default as _Cli } from './cli'`, so every support file importing a decorator from the package
   root transitively pulls in the runtime, the parallel adapter and the whole formatter tree — in every
   process and every preload thread.
1. **A portability bug in `Callsite.capture()`.** The `filename.replace(...)` call interpolates `cwd`
   followed by a hard-coded backslash, so the path is never made relative on Linux or macOS.

## Grades

Graded on quality of analysis and on impact of findings if acted on.

| Document | Quality of analysis | Impact of findings | Overall |
| --- | --- | --- | --- |
| `performance-analysis.md` | A− | A | **A−** |
| `analysis-2.md` | B+ | A− | **B+** |
| `analysis-3.md` | A | A | **A** |

The first two grades are carried forward from
[performance-enhancement-analysis.md](performance-enhancement-analysis.md) without change. Adding a third
document does not alter how well the first two analysed what they analysed, and grading here is
criterion-referenced rather than relative.

### `analysis-3.md` — A

**On analysis (A).** This is the most rigorous document in the directory, and it earns that on a
different axis than `performance-analysis.md` does. Where `performance-analysis.md` substitutes
measurement for assertion, `analysis-3.md` substitutes *mechanism proof* for assertion — and where a
document cannot benchmark, that is the next best thing.

The `files: true` analysis is the exemplar. It would have been enough to observe that the option triggers
a directory walk and call it wasteful; instead the document traces `config.fileNames` to its single
consumer, shows that consumer sits behind `if (!transpileOnly)`, and observes that every tsflow service
sets `transpileOnly: true`. That converts a plausible inefficiency into a demonstrated no-op, and it is
why the recommendation can be stated as "a no-behaviour-change deletion" rather than as something needing
validation. I verified every line of that chain and it is exact, down to the quoted comment.

The same discipline appears throughout: naming the installed `ts-node-maintained` version rather than
reasoning about "ts-node" generically; identifying that `transformSync` blocks on `Atomics.wait` rather
than merely asserting IPC cost; recognising that `source-map-support` memoises per file and therefore
sizing the callsite prize correctly. The transpile-multiplier table turns a diffuse "work is repeated"
complaint into four concrete configurations. And its sharpest architectural observation — that the CJS
path can never be made async because `require` is synchronous, so the ESM loaders are not just the newer
path but the only one that can ever parallelise transpilation — reframes the entire roadmap and appears
in neither other document.

It is also the most productive of the three: the ts-node bypass on the esbuild ESM path, the per-file
regex recompilation, the support-before-pickles ordering, the `shortUuid()` allocation, the dead
hardcoded specs check, `reloadSupport()` having no CLI surface, the Vue double template compile, and the
`metafile` route to transitive discovery are all unique to it.

Held at A rather than A+ for the same reason `analysis-2.md` was held down: no end-to-end measurement of
the actual system, and a ranking that consequently rests on derivation. Its multiplier table counts
repetitions rather than seconds; its Step 5 is admittedly speculative; and a handful of line anchors have
drifted. Its Step 0 is the correct response to its own limitation, which is to its credit but does not
substitute for having done it.

**On impact (A).** Several findings are both large and unusually cheap. Removing `files: true` is a
deletion with a proof of safety attached and removes a full recursive directory walk per process, per
child and per preload thread. Precompiling the path-mapping regexes eliminates work that scales as
aliases x files. Bypassing `ts-node` on the esbuild ESM `load` path removes a service creation, a module
classification and a `JSON.parse` / `JSON.stringify` / base64 cycle per file — and, crucially, unblocks
the async `transform()` API, which is the only route to concurrent transpilation on the only path that
can support it.

The load-ordering finding deserves separate mention because it targets a cost the other documents miss
entirely: running `--name "one scenario"` currently transpiles and evaluates the entire support tree
before discovering it needs three files. For an everyday developer loop that is the largest single win
available anywhere in this directory, and even the conservative half of it — inverting the order to allow
an early exit — is tractable.

The reshaping of the preload phase from "evaluate every module in N threads" to "transpile into the cache
in N threads" is better than `analysis-2.md`'s version of the same idea, because it recognises the second
and third order effects: transpiling needs no browser globals, which deletes the 170-line `window` shim
and the class of bugs it exists to paper over, and it removes the hazard of running module-level side
effects N+1 times.

Held at A rather than A+ because its Step 1 shares the conditionality of every cache proposal — the payoff
lands on repeat runs with unchanged sources, so a cold CI run gets little — and because Step 5, its
biggest everyday win, is the least proven thing in the document.

### `performance-analysis.md` — A− (carried forward)

Still the only document that measured anything, still the only one covering runtime step execution, and
its `getStepScenarioContext` finding remains untouched by either startup document. Marked down for
benchmarking a replica rather than the real call path, for leading with a worst-case extrapolation, and
for the miscount in item 5. Full detail in
[performance-enhancement-analysis.md](performance-enhancement-analysis.md).

### `analysis-2.md` — B+ (carried forward)

Excellent architectural reasoning — the observation that ESM and CJS being equally slow locates the
bottleneck in the shared model rather than either loader is genuinely good, and it leads to the correct
diagnosis. Marked down on evidence discipline: no timings while ranking ten items "by leverage," a
misreported grep, and an understated risk in its concurrent-import proposal.

The arrival of `analysis-3.md` does not change that grade, but it does change the document's *standing*.
On shared ground `analysis-3.md` is strictly better sourced, and it gets right the one fact `analysis-2.md`
got wrong. What keeps `analysis-2.md` in the working set is the three unique items listed above,
particularly `module.registerHooks()`.

## Consolidated worklist

All three documents merged, ordered by confidence times payoff divided by risk. Sources: `[PA]`
`performance-analysis.md`, `[A2]` `analysis-2.md`, `[A3]` `analysis-3.md`.

| # | Change | Source | Why here |
| --- | --- | --- | --- |
| 1 | `TSFLOW_TIMING` phase instrumentation plus a slowest-files table | `[A3]` 0, `[A2]` | Nothing below is currently measurable; this is also the regression test |
| 2 | Track the running pickle's context on `MessageCollector`; both call sites read it | `[PA]` 1 | Removes a superlinear runtime cost; `getHookScenarioContext` is the working precedent |
| 3 | Remove `files: true` and the `TS_NODE_FILES` forcing from all three ESM services | `[A3]`, `[A2]` 6 | Proven dead work; a deletion with no behaviour change |
| 4 | Memoize pattern-to-`RegExp` in `runtime/utils.ts` | `[PA]` 1 | Ten lines, pure function, defence in depth behind #2 |
| 5 | Replace the `Array.find` closures in `updateSupportCodeLibrary` with `Map` lookups | `[PA]` 5, `[A3]` | Removes O(B x D) per process, i.e. per parallel child |
| 6 | Precompile the tsconfig path-mapping regexes once instead of per file | `[A3]` | Removes aliases x files regex compilations and full-source scans |
| 7 | Cache resolution on `specifier + parentURL`; stop awaiting `getEsmHooks()` on resolves that cannot reach the `.ts` branch | all three | Cheapest win in `loader-utils.mjs`; most visible on Windows |
| 8 | Lazy callsite resolution plus `Error.stackTraceLimit`; fix the hard-coded backslash | `[A2]` 4, `[A3]` | Per-binding stack walks and per-file map parses off the critical path, plus a portability fix |
| 9 | Hoist tag lowercasing, per-step hook filtering, and definition lookups | `[PA]` 2, 3, 4 | Small, mechanical, no behavioural change |
| 10 | Send resolved `requirePaths` / `importPaths` to parallel children instead of re-globbing | `[A2]` 3, `[A3]` | Removes N full glob passes |
| 11 | Hoist the `shortUuid()` translator to module scope; index `registerStepBinding` dedupe | `[A3]`, `[PA]` 6 | One-line and near-one-line allocations per binding |
| 12 | Guard hot-path `logger.checkpoint` arguments behind `isVerbose()` | `[A2]` 8, `[A3]` | Free; a constant on the hottest loop |
| 13 | Delete or correct the hardcoded `cucumber-tsflow-specs` check in `esbuild.mjs`'s `supports()` | `[A3]` | Dead today, silently breaks every consumer if wired up; the two `supports()` exports also disagree |
| 14 | `module.enableCompileCache()` in the CLI entry, guarded and measured | `[PA]` 8, `[A3]` | Cheap, composes with #16, but verify the custom-loader interaction |
| 15 | Derive the preload thread count from `availableParallelism()` rather than capping at four | `[A2]` 10, `[A3]` | Only worth doing once the phase does something durable — sequence after #17 |
| 16 | Content-addressed on-disk transpile cache | `[A2]` 1, `[A3]` 1 | Largest structural win; include `absoluteBaseUrl` in the key per `[A3]`, and resolve the coordinator/child thundering herd |
| 17 | Reshape `parallelPreload` to transpile into the cache rather than evaluate modules | `[A3]` 4, `[A2]` | Deletes the 170-line `window` shim and the N+1 side-effect hazard; depends on #16 |
| 18 | Bypass `ts-node` in the esbuild ESM `load` path and switch to async `transform()` | `[A3]` 3 | Removes the source-map round trip and unblocks concurrent transpilation on the only path that permits it |
| 19 | Invert Gherkin parsing ahead of support loading, with an early exit on no matches | `[A3]` 5 | The conservative half of the biggest everyday win |
| 20 | Lightweight `bindings` entry point; drop `./cli` from the root barrel | `[A2]` 9 | Needs a matching key in the `exports` map of `cucumber-tsflow/package.json` |
| 21 | `module.registerHooks()` for the ESM path | `[A2]` 7 | Unique to `[A2]`; substantial ESM win, needs care around async `loadVue` |
| 22 | Concurrent `import()` of support files | `[A2]` 5, `[A3]` 3 | Registration-order risk; `[A3]`'s concurrent-warm-then-serial-evaluate variant is the safer shape |
| 23 | Expose `reloadSupport()` as a CLI watch mode | `[A3]` 5 | The eviction logic already exists with no command-line surface |
| 24 | Persisted `pattern → source file` index for filtered runs | `[A3]` 5 | Biggest everyday win but least proven; behind a flag, with full-load fallback |
| 25 | esbuild `build()` bundling to replace per-file `transformSync` | `[A2]` 2 | Most speculative item in the directory; prototype behind a flag |

Items 2 through 13 are small, independently testable, and carry no architectural risk. Items 16 through
18 are one coupled decision. Items 24 and 25 should not be attempted until item 1 exists to prove they
help.

## One note on all three

None of the three is testable against the current spec suite, and all three say so. Twenty-eight
scenarios across eight feature files will not surface behaviour that scales with scenario count, and the
spec workspaces' support trees will not surface behaviour that scales with file count. Every finding in
every document grows with suite size, and none are visible in the workspaces used for correctness
testing.

That is why item 1 is item 1. Two of the three documents independently identified instrumentation as the
prerequisite, and the third could not rank its own findings without it.
