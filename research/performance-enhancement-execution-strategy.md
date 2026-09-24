# Performance Enhancement Execution Strategy

This is the source of truth for the performance-enhancement work on branch `2026-09-speed-enhancements`: what
was planned, what landed in each phase, what was measured, and where the work stands now. It is a map. The
detail lives in the documents under [execution-strategy/](execution-strategy/), one per phase or stage, so that a
session loads the parts it needs and nothing else. Attaching this file alone is enough to start the next piece
of work: it says what to read next.

The work rates the twenty-five changes on the consolidated worklist in
[performance-enhancement-analysis-2.md](performance-enhancement-analysis-2.md) on two independent axes, how much
performance is recovered and how hard the change is to do correctly, and executes them in phases. The worklist
is the merge of the three investigations in this directory ([performance-analysis.md](performance-analysis.md),
[analysis-2.md](analysis-2.md) and [analysis-3.md](analysis-3.md)), and the item numbers used throughout are that
worklist's numbers, unchanged. The rating scales, the summary table, every item's rating with its reasoning and
the re-rating after Phase 5 are in [ratings.md](execution-strategy/ratings.md). Items 26 to 28 were added by that
re-rating; later re-ratings are recorded in the hand-off of the phase that measured them.

## How to resume

To start or continue a phase or stage from a cold session, read in this order and stop as soon as you have what
you need:

1. [Where the work stands](#where-the-work-stands), just below: the current stage, the state of the branch, and
   the first act of the next session.
1. The latest hand-off document named there. Its closing "Notes specific to ..." section is written for the next
   session and lists what to do first, what to watch, and what was left over.
1. [phase-12-plan.md](execution-strategy/phase-12-plan.md) for the definition of the current stage: the stage
   list with gates and cadence under "Stages and gates", the 12c triage table, the decisions taken with the
   owner, and the exit criteria.
1. Only when a question about an earlier decision or measurement comes up: the hand-off of the phase that took
   it, or `ratings.md` for why an item was rated as it was.

Do not read every document. The Phase 1 to Phase 11 hand-offs are closed history. They answer "why is it like
this" and "what did that measure", not "what do I do next".

## Where the work stands

Updated at every hand-off, so that this block is always current.

- **Stage:** 12d, housekeeping sweeps, of Phase 12 (the release gate) is **complete (2026-09-24)**: the library
  compiles under `strict: true`, `yarn typecheck` and `yarn lint` are gates that CI runs (findings Q and R), the
  source and the documents are in American English, the 12c leftovers landed, and every dependency on the audit
  list is decided (`import-sync` and `tslib` removed). The boundary matrix was green on all sixteen variants.
  **12e, documentation and packaging, is next.** The rule from 12c group 2 stands for the rest of the phase: the
  branch ships as a minor release (7.8), so no published option, flag or export is removed.
- **Branch:** 12c is `a29eb42`, `7a7af28`, `c57ca3f`, `1c4299b` and `85dc327` (one squashed commit per group,
  each with its documentation commit) on top of the triage commit `1c842e6`, with `fec46e9` (Z's spec under async
  hooks), `972d5b9` (the unit-test source-map global), `6920b17` (the shipped agent skill, a 12e draft) and
  `1d33fa7` (group 6, the closing measurement) among them. 12d is one squashed commit, `0dcbff3`, followed
  by its documentation commit. Everything is pushed. The commit workflow (small commits inside a stage, one
  squashed commit before the hand-off and before any push) is recorded at the end of the 12c hand-off.
- **First act of the next session:** 12e, documentation and packaging, in the order the stage definition gives,
  starting with `docs/performance-and-diagnostics.md` from the README's performance block. Take the items the
  earlier stages left for 12e from the closing notes of the 12c and 12d hand-offs (both READMEs still list
  **Parallel preload**; CONTRIBUTE.md still says `yarn test`; the shipped agent skill is re-read against the tree;
  finding G's cache-participation rule goes into Architecture.md). The dependency findings 12d left for the owner
  (five packages imported but not declared, the audit advisories) are decisions, not 12e work, and are listed in
  the 12d hand-off. Check `ListAgents` for a peer session before editing.
- **Read next:** [stage-12d-hand-off.md](execution-strategy/stage-12d-hand-off.md) (its closing notes first), then
  the 12e definition in [phase-12-plan.md](execution-strategy/phase-12-plan.md#12e-documentation-and-packaging).

## Phased plan

Each phase ends with a clean `yarn build` and a green `yarn test:all` before the next begins. Phases 6
onward were re-planned after Phase 5; see [Re-rating after Phase 5](execution-strategy/ratings.md#re-rating-after-phase-5).

**Phase 1: items 1, 12, 13 — COMPLETE (2026-09-03).** Instrumentation goes in first so every later phase
has a baseline to be measured against. Item 12 is the same "costs nothing when off" discipline applied to
the same resolve and load call sites, and item 13 is a dead-code deletion in the same file, so all three
touch the loaders once. See [Phase 1 hand-off](execution-strategy/phase-01-hand-off.md) for what landed and how to use it.

**Phase 2: items 2, 4, 5, 9, 11 — COMPLETE (2026-09-03).** The in-process runtime and registry hot paths.
Every one is a linear-scan-to-map or a hoist inside `src/runtime` and `src/bindings`, none touches a loader
or an IPC contract, and the spec matrix covers them fully. Item 2 is the dominant win, item 4 insures it,
and 5, 9 and 11 are the same lookup pattern in neighboring files. See
[Phase 2 hand-off](execution-strategy/phase-02-hand-off.md) for what landed and the measured effect.

**Phase 3: items 3, 6, 7 — COMPLETE (2026-09-03).** The per-file and per-process costs inside the ESM
`.mjs` loaders and `ts-node` services. A proof-backed deletion plus two caches with `pathResolutionCache`
as precedent; no cross-boundary contract changes, so a failure is a crash rather than a silently wrong
load. See [Phase 3 hand-off](execution-strategy/phase-03-hand-off.md) for what landed and the measured effect.

**Phase 4: items 8, 10, 14, 20 — COMPLETE (2026-09-03).** The fixed per-process startup costs: decorator-time
stack walks, the duplicate glob in each child, V8 compile of the module graph, and the size of that graph.
Items 10 and 14 can only be judged with Phase 1's numbers, which now exist, and this is the phase that touches
the package `exports` map and IPC contract, so it is isolated from the pure hot-path work. Item 8 turned out to
be worth far more than its rating: see [Phase 4 hand-off](execution-strategy/phase-04-hand-off.md) for what landed, the
`source-map-support`/jsdom finding, and the measured effect.

**Phase 5: items 18, 21 — COMPLETE (2026-09-04).** The ESM hook mechanics. Item 18 wants async `transform()`
and item 21 wants synchronous hooks, so the two have to be settled together, and they must be settled before
Phase 6 builds the cache into the `load` hook it reshapes. The four ESM workspaces are the test. Settled in
favor of synchronous in-thread hooks (`module.registerHooks()`), with item 18's ts-node bypass landed and its
async `transform()` half dropped; see [Phase 5 hand-off](execution-strategy/phase-05-hand-off.md).

**Phase 6: items 26, 28 — COMPLETE (2026-09-16).** Developer experience, open-ended by design. The fixed part is startup feedback: a
TTY-only progress line during support loading (and preload, while it exists) driven from the per-file loops
that already exist in `support.ts` and `loader-worker.ts`, a one-line startup summary, and nothing at all
when stderr is not a TTY or `--quiet`/CI is in effect, so formatter output and report files are untouched.
Item 28 (ESM callsite lines) rides along once the source-map dependency is approved, because it is the
other thing a developer sees first on an ESM suite. Further candidates are listed under item 26 and are
picked as the phase goes. See [Phase 6 hand-off](execution-strategy/phase-06-hand-off.md) for what landed, what was left, and the
Phase 7 measurement recipe.

**Phase 7: item 27 plus the `default` profile baseline — COMPLETE (2026-09-17).** One measurement session,
not a code change: CPU-profile the UIS `dim` run and split the 37 s between tsflow, CucumberJS, jsdom/Vue and
consumer steps. Its outcome decides whether a further runtime phase exists and re-orders everything below. In
the same session, take the first `TSFLOW_TIMING` measurement of the `default` profile's startup (about 1380
scenarios, 208 step files), which items 16 and 24 are both priced against and which has never been done. The capture recipe and the
attribution script (`research/scripts/attribute-cpuprofile.js`) are described under
[Notes specific to Phase 7](execution-strategy/phase-06-hand-off.md#notes-specific-to-phase-7). Outcome: tsflow is 0.4% of `runtime:run` on both the
`dim` and the full suite, so no runtime phase follows; the full suite's warm startup is 9.1 s, of which 2.8 s is
transpile work and 5.5 s Node's module loader. See [Phase 7 hand-off](execution-strategy/phase-07-hand-off.md).

**Phase 8: item 16 — COMPLETE (2026-09-17); `parallelLoad` removed, items 15 and 17 dropped (2026-09-17).** The
content-addressed on-disk transpile cache landed behind `--no-transpile-cache`, covering esbuild (CJS and ESM)
and the Vue SFC compile, keyed on source, path, options, tool versions and the tsflow version. Measured on the
UIS full suite in a same-build A/B: `esm:load` 3.05 s → 0.9–1.1 s and `support:import` 6.7 s → 5.1–5.5 s warm,
with all 974 transpiles served from disk in 0.25–0.31 s; on `dim`, 0.6–0.7 s of a 3 s startup. The
`parallelLoad` preload threads now populate the cache the main thread reads, which delivers most of item 17's
payoff and re-rates it down. The `parallelLoad` decision was then measured in the same session — the preload
phase costs 5–6 s on every run and saves at most 1.8 s, cold only — and the owner chose removal: the feature is
gone, the option is accepted and ignored with a loud deprecation notice, and items 15 and 17 are dropped with
it. Item 22 is dropped. See [Phase 8 hand-off](execution-strategy/phase-08-hand-off.md) and
[`parallelLoad` removal](execution-strategy/phase-08-hand-off.md#parallelload-removal-2026-09-17).

**Phase 9: items 19, 24 — COMPLETE (2026-09-17).** The filtered-run pair: 19 as the precondition for 24,
24 behind `selectiveLoad` (default off) with a full-load fallback. `runCucumber` now parses and filters the
features before loading support code, buffering the Gherkin envelopes until the formatters exist; with the
option on, only the support files whose step patterns the selected steps match are loaded, plus every file
that registered anything but step definitions, every new file and every file whose recorded import graph has
changed. Measured on the UIS full suite; see [Phase 9 hand-off](execution-strategy/phase-09-hand-off.md).

**Phase 10: item 23 — COMPLETE (2026-09-18).** `--watch`: one resident process that reruns on file changes or
Enter, keeping every module loaded except what must evaluate again (support files that registered something,
changed files and their dependents, decorator-applying helpers). CommonJS is evicted from `require.cache`; ES
modules are re-imported under a `?tsflow=<n>` version query applied by the in-thread resolve hook, the cache-busting
option from the Phase 9 notes, chosen over a resident coordinator with a child per run because only a resident
module graph removes the set-up floor Phase 9 measured. Loaders on the hooks thread fall back to a fresh child
process per run. See [Phase 10 hand-off](execution-strategy/phase-10-hand-off.md).

**Phase 11: item 25 — CLOSED WITHOUT A PROTOTYPE (2026-09-22).** The bundling prototype was priced before it was
built. Its remaining case after Phases 9 and 10 was the fresh-process full run; on the UIS suite 1596 of the 2564 ES
modules that load are external dependencies a bundle would leave alone and jsdom loads by `require()` outside the
hooks, so the ceiling is 1–3 s of a 241 s CI run, about 1%. The owner closed the item as not worth the highest
complexity on the list; the measurement, the reasoning and the feasibility findings for a future attempt are in
[Phase 11 hand-off](execution-strategy/phase-11-hand-off.md).

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
[Phase 12 scope](execution-strategy/phase-12-plan.md#phase-12-scope) for the strands, the decisions to take, and the exit criteria. The decisions taken at the
start of the phase, the coverage inventory, the review findings list and the split into stages 12a–12f, each with its
own gate and hand-off, are in [Phase 12 baseline](execution-strategy/phase-12-plan.md#phase-12-baseline).

## Document map

All documents live under [execution-strategy/](execution-strategy/). Each begins with a link back to this map.

| Document | Contents | Read it when |
| --- | --- | --- |
| [ratings.md](execution-strategy/ratings.md) | Rating scales, summary table, every item's rating and reasoning, what the ratings reveal, re-rating after Phase 5 (adds items 26 to 28) | An item's number, rating or original reasoning is in question |
| [phase-01-hand-off.md](execution-strategy/phase-01-hand-off.md) | Items 1, 12, 13: `TSFLOW_TIMING` instrumentation and how to use it in later phases | Taking or reading a timing measurement |
| [phase-02-hand-off.md](execution-strategy/phase-02-hand-off.md) | Items 2, 4, 5, 9, 11: runtime and registry hot paths; first measured effect on the large suite | Runtime lookup structures |
| [phase-03-hand-off.md](execution-strategy/phase-03-hand-off.md) | Items 3, 6, 7: ESM loader and ts-node service costs, resolution cache | Loader resolution or path mapping |
| [phase-04-hand-off.md](execution-strategy/phase-04-hand-off.md) | Items 8, 10, 14, 20: callsite resolution, `source-map-support` and jsdom finding, compile cache, `bindings` entry point | Startup constants, decorator-time stack walks, package `exports` |
| [phase-05-hand-off.md](execution-strategy/phase-05-hand-off.md) | Items 18, 21: synchronous in-thread ESM hooks (`module.registerHooks()`), ts-node bypass | The ESM hooks model, `TSFLOW_ESM_HOOKS` |
| [phase-06-hand-off.md](execution-strategy/phase-06-hand-off.md) | Items 26, 28: startup progress line, ESM callsite lines; Phase 7 measurement recipe | Startup output, themes, spinner |
| [phase-07-hand-off.md](execution-strategy/phase-07-hand-off.md) | Item 27: CPU-profile attribution of the UIS runs; `default` profile startup baseline; re-rating | Where the time goes on a real suite |
| [phase-08-hand-off.md](execution-strategy/phase-08-hand-off.md) | Item 16: transpile cache; `parallelLoad` A/B and removal (items 15, 17, 22 dropped); re-rating | The cache key, the preload removal |
| [phase-09-hand-off.md](execution-strategy/phase-09-hand-off.md) | Items 19, 24: parse before load, selective loading and its fallbacks; re-rating | Selective loading, the module graph |
| [phase-10-hand-off.md](execution-strategy/phase-10-hand-off.md) | Item 23: `--watch`, the resident process, eviction and `?tsflow=<n>` re-import; the clean reference numbers | Watch mode, the Phase 10 reference the closing measurement is compared to |
| [phase-11-hand-off.md](execution-strategy/phase-11-hand-off.md) | Item 25 closed without a prototype: the bundling ceiling and feasibility findings | A future bundling attempt |
| [phase-12-plan.md](execution-strategy/phase-12-plan.md) | Phase 12 scope; baseline: decisions with the owner, coverage inventory, review findings A to AH, 12c triage, stages 12a to 12f with gates (12e includes the shipped agent skill), amended exit criteria | Starting any Phase 12 stage |
| [stage-12a-hand-off.md](execution-strategy/stage-12a-hand-off.md) | Test foundation: `node:test` runner, seams, unit tests, CI matrix | The unit-test layout and seams |
| [stage-12b-hand-off.md](execution-strategy/stage-12b-hand-off.md) | Behavior discovery: end-to-end specs, failure-path pass, findings Y to AH classified | A 12b finding's origin |
| [stage-12c-hand-off.md](execution-strategy/stage-12c-hand-off.md) | Review refactors: groups 1 to 5 and the Z fix, the closing measurement (group 6) with finding P's compile-cache A/B, the commit workflow, the two-session working agreement, leftovers for 12d | The UIS numbers 12c closed on; why a 12c refactor is shaped as it is |
| [stage-12d-hand-off.md](execution-strategy/stage-12d-hand-off.md) | Housekeeping sweeps: the strict fixes, the `typecheck` and `lint` gates, the spelling pass, the dependency audit with its open decisions, the 12c leftovers, what is left for 12e and the owner | Continuing Phase 12 from 12e; a dependency or audit question |

Related documents outside this folder: [local-consumer-testing.md](local-consumer-testing.md) (the UIS Tools
testbed and how it is linked in), [phase-4-callsite-resolution-and-jsdom.md](phase-4-callsite-resolution-and-jsdom.md)
(the Phase 4 investigation), and [Architecture.md](../Architecture.md), which describes the product as it ships.

## Conventions

- **One hand-off document per phase or stage,** named `phase-NN-hand-off.md` or `stage-12x-hand-off.md`, in the
  shape of the earlier ones: state of the tree, what landed, measured effect, notes specific to the next phase or
  stage. A stage that spans several sessions (12c) keeps one document and updates it as groups land.
- **Writing a hand-off also updates this map:** the "Where the work stands" block, the status line of the phase
  in the phased plan above (or the stage's status line in `phase-12-plan.md`), and the document map row.
- **Plan changes stay in the plan documents.** A re-rating taken at a hand-off is recorded in that hand-off, as
  before, and the plan links to it; stage definitions, triage and gates change in `phase-12-plan.md`.
- **Links are relative** and anchors are GitHub heading slugs. Every document starts with a link back to this
  map, and the map links to every document, so the set stays navigable from any entry point.
- **Keep this map short.** It should read in one screen plus the phased plan. Detail that is only needed once
  belongs in a hand-off, not here.
