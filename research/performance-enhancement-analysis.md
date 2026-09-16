# Performance Enhancement Analysis

A review of the two performance investigations in this directory —
[performance-analysis.md](performance-analysis.md) and [analysis-2.md](analysis-2.md) — covering what each
one examined, which of their claims hold up against the current source, and a graded assessment of each.

## Method

Every load-bearing claim in both documents was checked against `cucumber-tsflow/src` at the current
working-tree state. That verification is the basis for the grades: a performance document's value is
the accuracy of its diagnosis, not the confidence of its prose.

No benchmarks were re-run. Where a document reports its own measurements, those numbers are treated as
claims about method rather than as independently confirmed figures — the plausibility of each is noted.

## The two documents cover almost disjoint ground

This is the most important thing to understand about them, and it is easy to miss because both are
titled as general performance analyses.

| | `performance-analysis.md` | `analysis-2.md` |
| --- | --- | --- |
| Phase examined | Step execution and registration | Pre-run: discovery, transpilation, load |
| Cost model | Per-step, scaling with scenario count | Per-file, scaling with support-tree size and worker count |
| Evidence base | Isolated microbenchmarks plus source reading | Source reading only |
| Top finding | Full-suite rescan on every step lookup | No transpile cache exists anywhere |
| Layers touched | `runtime/`, `bindings/` | `api/`, `transpilers/`, `bindings/` decorator entry |

Neither document's headline finding appears anywhere in the other. `analysis-2.md` states its exclusion
explicitly ("does not cover step execution, world/context activation, formatter output, or reporting"),
so this is deliberate scoping rather than an oversight in either case. The practical consequence is that
they are additive: adopting one does not reduce the value of the other, and the combined worklist at the
end of this document is materially better than either alone.

### Where they do overlap, they agree

Three findings appear in both, reached by different routes:

1. **`parallelLoad` warms a cache that does not exist.** `analysis-2.md` item 1 and
   `performance-analysis.md` item 7 independently conclude that the phase described in
   [parallel-loader.ts](../cucumber-tsflow/src/api/parallel-loader.ts) cannot do what its own header
   comment claims. Two independent derivations of the same conclusion make this the highest-confidence
   finding across both documents.
1. **ESM specifier resolution performs up to 14 uncached `existsSync` calls.**
   `analysis-2.md` item 7 and `performance-analysis.md` Tier 4 both identify
   `resolveWithExtensions` in [loader-utils.mjs](../cucumber-tsflow/src/transpilers/esm/loader-utils.mjs),
   and both note that the adjacent `pathResolutionCache` already establishes the fix pattern.
1. **Every forked parallel child re-transpiles the entire support tree.** `analysis-2.md` item 3
   develops this into an `(N + 1) x` cost model; `performance-analysis.md` reaches it as a consequence
   of item 7 and again in item 8's argument for `module.enableCompileCache()`.

## Verification results

### Confirmed as written

Both documents cite line numbers, and essentially all of them resolve correctly.

From `performance-analysis.md`:

- `getStepScenarioContext` does iterate the entire `pickleMap` and every step of every pickle, calling
  `hasMatchingStep` per comparison ([message-collector.ts](../cucumber-tsflow/src/runtime/message-collector.ts)).
  `hasMatchingStep` does construct a `new RegExp()` after 14 chained `String.replace()` passes on every
  call, with no memoization ([utils.ts](../cucumber-tsflow/src/runtime/utils.ts)).
- The two call sites are real and both per-step: the step trampoline in
  [binding-decorator.ts](../cucumber-tsflow/src/bindings/binding-decorator.ts) and `runStep` in
  [test-case-runner.ts](../cucumber-tsflow/src/runtime/test-case-runner.ts).
- The contrast with `getHookScenarioContext` is real and is the strongest single piece of evidence in
  either document: the hook path already does the O(1) `pickle.id` lookup that the step path should do.
- `hasMatchingTags` does re-map the tag array inside the `lep.parse` predicate callback.
- `getBeforeStepHookDefinitions` / `getAfterStepHookDefinitions` do re-filter per step, and the "after"
  variant does allocate through `.slice(0).reverse()` each time.
- `findHookDefinition` does rebuild a concatenated array per hook step; `findStepDefinition` does
  linear-scan.
- `updateSupportCodeLibrary` does use `definitions.find(...)` per binding, giving
  O(bindings x definitions) ([binding-registry.ts](../cucumber-tsflow/src/bindings/binding-registry.ts)).
- `registerStepBinding` does dedupe with two `Array.some()` scans.
- `module.enableCompileCache()` appears nowhere in the source tree.
- The `transformImports` correctness edge is real: `transformed.replace(originalImport, newImport)`
  replaces only the first occurrence.

From `analysis-2.md`:

- There is no on-disk cache. A search for `writeFileSync`, `mkdirSync`, `createHash`, and
  `node_modules/.cache` across `cucumber-tsflow/src` returns **zero** hits.
- Both esbuild paths call `transformSync` per file
  ([esbuild.ts](../cucumber-tsflow/src/transpilers/esbuild.ts),
  [esbuild.mjs](../cucumber-tsflow/src/transpilers/esm/esbuild.mjs)).
- Support files are loaded strictly serially — a `for` loop over `importPaths` with `await import()`
  inside it, in [support.ts](../cucumber-tsflow/src/api/support.ts), repeated in
  [worker.ts](../cucumber-tsflow/src/runtime/parallel/worker.ts).
- Each parallel child does call `resolvePaths` again despite the coordinator already holding the
  resolved lists ([worker.ts](../cucumber-tsflow/src/runtime/parallel/worker.ts)).
- `Callsite.capture()` does mutate `Error.prepareStackTrace` twice per binding, materialize a full
  stack, and call `sourceMapSupport.wrapCallSite` eagerly
  ([our-callsite.ts](../cucumber-tsflow/src/utils/our-callsite.ts)). It is reached from nine decorator
  factories, i.e. every step and hook decorator.
- The adjacent portability bug is real: the `filename.replace(...)` call interpolates `cwd` followed by
  a hard-coded backslash, so the path is never made relative on Linux or macOS.
- `TS_NODE_FILES` and `files: true` are set on the ESM path only
  ([tsnode-service.mjs](../cucumber-tsflow/src/transpilers/esm/tsnode-service.mjs),
  [tsnode-loader.mjs](../cucumber-tsflow/src/transpilers/esm/tsnode-loader.mjs),
  [vue-loader.mjs](../cucumber-tsflow/src/transpilers/esm/vue-loader.mjs)) and not on the CJS path, which
  supports the document's hypothesis about an ESM-versus-CJS startup difference.
- The eager service construction is real and subtle: `tsNodeHooks: await getLocalEsmHooks()` is
  evaluated as an argument on every `resolve` call, including for `node:` builtins that will never reach
  the ts-node branch ([loader-utils.mjs](../cucumber-tsflow/src/transpilers/esm/loader-utils.mjs)).
- [index.ts](../cucumber-tsflow/src/index.ts) does `import { default as _Cli } from './cli'`, so every
  support file that imports a decorator from the package root pulls in the CLI, the runtime, the parallel
  adapter, and the whole formatter tree.
- Preload thread count is capped at `Math.min(availableParallelism(), 4)`, and worker descriptors are
  collected into `allDescriptors` and returned but never validated against anything.

### Corrections

- **`performance-analysis.md` item 5 undercounts.** It says `updateSupportCodeLibrary` "is also applied
  twice to the same library," citing `load-support.ts:88` and `run-cucumber.ts:145`. There are in fact
  three non-worker call sites — `load-support.ts:88`, `load-support.ts:148`, and `run-cucumber.ts:145`
  — plus one in `worker.ts:109`. The direction is right and the finding is strengthened, not weakened.
- **`analysis-2.md` misreports its own grep.** It states that a search for cache writes "returns exactly
  one unrelated hit in the Gherkin manager." There are no such hits at all. The conclusion holds and is
  in fact stronger than claimed, but a misreported piece of cited evidence matters more in a document
  that rests entirely on source reading, because the reader has no numbers to fall back on.

### Claims that remain unvalidated

- `performance-analysis.md`'s benchmark table is produced by an "isolated replica" of the scan with the
  matching step "placed at the worst-case position." The document discloses both facts, which is to its
  credit. But `getStepScenarioContext` breaks out of both loops on first match, so a realistic average
  is well under the worst case, and the headline "roughly 100 seconds" for a 500-scenario suite is
  worst-case x 2 call sites. The order of magnitude is plausible — roughly 25M regex constructions —
  but the figure should be read as an upper bound, not an expected value.
- `analysis-2.md`'s ranking is entirely unmeasured. Item 1 is asserted as "the single largest finding"
  on architectural reasoning alone. That reasoning is good, but the document's own Measurement section
  concedes the point: "none of the above should be accepted on reasoning alone, and the current
  instrumentation is not adequate to confirm it."
- `analysis-2.md` item 5 (switching serial `await import()` to `Promise.all`) is presented as "likely
  safe" with a note to validate against `validations.feature`. This understates the risk. Decorator
  registration runs at module-evaluation time and the registry is built by side effect, so changing
  evaluation order changes registration order; the duplicate-detection argument is sound but does not
  cover ordering effects on ambiguity reporting or on `beforeAll` sequencing.
- `analysis-2.md` item 2 (replacing per-file `transformSync` with a single `esbuild.build()` pass) is
  the largest proposal in either document and is entirely conjectural. The document places it in Phase 4
  behind a config flag, which is the correct call.

## Grades

Graded on two criteria: the quality of the analysis itself, and the impact of the findings if acted on.

### `performance-analysis.md`

| Criterion | Grade |
| --- | --- |
| Quality of analysis | A− |
| Impact of findings | A |
| **Overall** | **A−** |

**On analysis.** This is the more rigorous of the two documents. It is the only one that measured
anything, it states its methodological limits in a "Method and caveats" section before making any claim,
and every line citation checked out. It quantifies the proposed fixes as well as the problem — the
current-versus-memoized-versus-direct-lookup table is exactly the comparison a reader needs to choose
between them. It correctly flags item 7 as needing a timed A/B before action rather than asserting it.
It also found a latent correctness bug in `transformImports` while looking for a performance issue,
which is a sign of careful reading. Marked down for benchmarking a replica rather than the real call
path, for leading with a worst-case extrapolation as though it were typical, and for the miscount in
item 5.

**On impact.** Item 1 is the best finding in either document on a cost-to-benefit basis. It is a
superlinear cost on the hottest path in the runtime, the memoization fix is about ten lines with no
behavioural change, and the structural fix is a field on `MessageCollector` set in `startTestCase` and
cleared in `endTestCase` — modeled directly on what `getHookScenarioContext` already does, so there is a
working precedent in the same file. Items 2 through 6 are all small, safe, and mechanical. Item 8 is a
single line with a genuine cross-process payoff. Very little of this document is speculative, which is
why it grades a full A on impact despite a lower ceiling than `analysis-2.md`.

### `analysis-2.md`

| Criterion | Grade |
| --- | --- |
| Quality of analysis | B+ |
| Impact of findings | A− |
| **Overall** | **B+** |

**On analysis.** The architectural reasoning here is the best in either document. The framing
observation — that the pre-run phase dominates regardless of whether the ESM or CJS transpilers are
used, and that the symmetry itself locates the bottleneck in the shared model rather than in either
loader — is a genuinely good inference, and it is what leads to the correct diagnosis that no cache
exists. The causal chain on `parallelLoad` (separate V8 isolates, independent module registries, output
discarded at `worker.terminate()`, therefore nothing can be warmed) is airtight. The observation that
the current architecture discards esbuild's two real advantages, its internal parallelism and
whole-graph processing, explains an otherwise puzzling symptom. The Measurement section is the best part
of either document and should be implemented first regardless of which findings are adopted.

Marked down to B+ on evidence discipline rather than on reasoning. A performance document with no
timings is a set of well-argued hypotheses, and this one ranks ten items "by leverage" without any
measurement to support the ordering — so a reader cannot tell whether item 1 or item 4 is worth doing
first. The misreported grep compounds this: when reasoning is the only evidence, the cited facts have to
be exact. Item 5's risk is understated, and a substantial share of the document's length goes to a
Phase 4 proposal that may not survive prototyping.

**On impact.** The ceiling here is higher than the other document's. If the reported symptom is a
pre-run phase measured in tens of seconds, then the disk cache and the `(N + 1) x` multiplication are
the largest wins available in the codebase, and no amount of step-lookup optimization touches them.
Item 4 (lazy callsite resolution) is the standout individual finding — thousands of stack walks and up
to one source-map parse per support file removed from the critical path, at low risk, and it is unique
to this document. Item 6's one-line `TS_NODE_FILES` removal is nearly free.

Held to A− rather than A for three reasons. The top-ranked item pays off only on repeat runs with
unchanged sources, so a cold CI run gets nothing from it. The largest item is unvalidated and explicitly
needs a prototype. And several items — the logger allocations in item 8, the dead descriptor payload in
item 10 — are marginal, which dilutes the set.

## Combined worklist

Ordered by confidence times payoff divided by risk, drawing on both documents. Sources are marked
`[PA]` for `performance-analysis.md` and `[A2]` for `analysis-2.md`.

| # | Change | Source | Why here |
| --- | --- | --- | --- |
| 1 | Phase timing instrumentation and a `--profile-startup` summary | `[A2]` | Everything below should be validated, and neither document can currently tell you where the time goes |
| 2 | Track the running pickle's context on `MessageCollector`; both call sites read it | `[PA]` 1 | Removes a superlinear cost entirely; precedent already exists in `getHookScenarioContext` |
| 3 | Memoize pattern-to-`RegExp` in `utils.ts` | `[PA]` 1 | Ten lines, pure function, worth doing even after #2 as defence in depth |
| 4 | Lazy callsite resolution plus `Error.stackTraceLimit` | `[A2]` 4 | Highest payoff per unit of risk on the load path; also fixes the Windows-separator portability bug |
| 5 | Drop `files: true` / `TS_NODE_FILES` from the ESM path | `[A2]` 6 | One line; removes a full project directory walk per ESM process |
| 6 | Hoist the tag lowercasing and the per-step hook filtering; index definitions by id | `[PA]` 2, 3, 4 | Small, mechanical, no behavioural change |
| 7 | Index `updateSupportCodeLibrary` and `registerStepBinding` by key | `[PA]` 5, 6 | Removes quadratic work per process, which means per worker in parallel mode |
| 8 | `module.enableCompileCache()` in the CLI entry | `[PA]` 8 | One line, cross-process, verified absent |
| 9 | Cache positive and negative resolutions in `resolveWithExtensions` | both | Corroborated by both documents; most visible on Windows |
| 10 | Defer `getLocalEsmHooks()` behind a thunk | `[A2]` 7 | Stops eager ts-node service creation on the first resolve |
| 11 | Content-addressed on-disk transpile cache | `[A2]` 1 | Largest structural win, but sequence it after #1 so the payoff is measurable, and resolve the coordinator/child thundering herd |
| 12 | Send resolved paths and config to parallel children over IPC | `[A2]` 3, 6 | Removes N re-globs and N tsconfig parses; low risk |
| 13 | Resolve `parallelLoad`: measure, then remove it or make it real | both | Highest-confidence finding in either document; the decision depends on #11 |
| 14 | Lightweight `bindings` entry point | `[A2]` 9 | Needs a matching key in the `exports` map of `cucumber-tsflow/package.json` |
| 15 | `module.registerHooks()` for the ESM path | `[A2]` 7 | Substantial ESM-only win; needs care around the async `loadVue` path |
| 16 | Concurrent `import()` of support files | `[A2]` 5 | Deferred past its original Phase 2 placement — the registration-order risk needs the instrumentation from #1 to evaluate honestly |
| 17 | esbuild `build()` bundling to replace per-file `transformSync` | `[A2]` 2 | Prototype behind a config flag; validate against the full spec matrix |

Items 2 through 8 are all small, independently testable, and carry no architectural risk. Items 11
through 13 are one coupled decision rather than three. Item 17 should not be attempted until item 1
exists to prove it helps.

## One note on both documents

Neither is testable against the current spec suite. `performance-analysis.md` says so directly — 28
scenarios across 8 feature files will not surface behaviour that scales with scenario count — and
`analysis-2.md` makes the same point about support-tree size. Every finding in both documents grows with
suite size, and none of them are visible in the workspaces used for correctness testing. That makes
`analysis-2.md`'s Measurement section the real prerequisite for acting on either document, which is why
it is item 1 above.
