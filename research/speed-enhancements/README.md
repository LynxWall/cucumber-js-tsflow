# Speed enhancements

Part of the [research index](../README.md).

The September 2026 performance work on branch `2026-09-speed-enhancements`, which ships as release 8.0.0.

## Goal and outcome

The goal was the time cucumber-tsflow spends before the first scenario of a large suite runs. The numbers come
from UIS Tools, the largest cucumber-tsflow suite at JHU UIS (about 1,600 scenarios, Vue 3, `es-vue-esm`), the
reference suite for every measurement. On that suite:

- The full suite (1,624 scenarios) runs in 4½ to 6 minutes, against about 15 minutes on 7.5.5, the version the
  team runs; the wait before the first scenario went from about 6 minutes to 15 to 25 seconds
  ([measurements/uis-tools-7.5.5-vs-8.0.0.md](measurements/uis-tools-7.5.5-vs-8.0.0.md)).

Warm, against the 7.7.2 the branch was cut from:

- The `dim` profile (334 scenarios) spent about 24 s loading its support code on 7.7.2, and 20 s of that was
  `source-map-support` issuing a synchronous `XMLHttpRequest` for every support file under jsdom. It now loads
  in about 2.5 s.
- The full suite loads its support code in about 4 to 7 s, against 7.7 s when it was first measured (Phase 7).
- One scenario of the full suite reruns under `--watch` in about 1 s (0.8 s with selective loading), against
  7.8 s for a fresh process.
- The test runtime was left alone on purpose: cucumber-tsflow is 0.4% of `runtime:run`; the rest is jsdom, Vue
  and the suite's own steps.

## How this folder is organized

| Path | What is in it |
| --- | --- |
| [performance-enhancement-execution-strategy.md](performance-enhancement-execution-strategy.md) | The map and source of truth: the phased plan, what each phase landed and measured, where the work stands, and a table of every document |
| [decisions.md](decisions.md) | The durable design decisions, condensed: the problem, the decision, the evidence and the consequences of each |
| [detailed-changes.md](detailed-changes.md) | The engineering-level list of what changed on the branch |
| [analysis/](analysis/) | The three investigations that started the work, the two reviews that merged them into one worklist of 25 items, and the Phase 4 write-up of the jsdom finding |
| [plan/](plan/) | `ratings.md` (every worklist item rated for impact and complexity, and re-rated after Phase 5) and `phase-12-plan.md` (the review and release phase) |
| [hand-offs/](hand-offs/) | One document per phase (1 to 11) and per stage of Phase 12 (12a to 12f), written at the end of each session: the state of the tree, what landed, what was measured, and notes for the next session |
| [testing/](testing/) | How the local build was linked into UIS Tools, run, timed and profiled |
| [measurements/](measurements/) | The full UIS Tools suite on 7.5.5 against the release, taken in the release review |
| [scripts/](scripts/) | `attribute-cpuprofile.js`, which splits a V8 CPU profile by layer, and `watch-driver.js`, which drives `--watch` through a piped stdin |
| `profiles/` | Local only and gitignored: the CPU profiles and run logs behind the measurements |

## Where to start reading

1. [decisions.md](decisions.md), for why the product is shaped the way it is.
1. [detailed-changes.md](detailed-changes.md), for what changed at the engineering level.
1. [The map](performance-enhancement-execution-strategy.md), for the order of the work and its measurements;
   its "Document map" table says which hand-off answers which question.
1. A hand-off, only when a question needs the full record of a phase or stage.

## Paths in the older documents

The folder was reorganized after the work, so documents written during it quote the earlier layout. A path in
the first column is now the one in the second:

| Quoted as | Now |
| --- | --- |
| `research/performance-enhancement-execution-strategy.md` | [performance-enhancement-execution-strategy.md](performance-enhancement-execution-strategy.md) |
| `research/performance-analysis.md`, `research/analysis-2.md`, `research/analysis-3.md`, `research/performance-enhancement-analysis.md`, `research/performance-enhancement-analysis-2.md`, `research/phase-4-callsite-resolution-and-jsdom.md` | [analysis/](analysis/) |
| `research/execution-strategy/ratings.md`, `research/execution-strategy/phase-12-plan.md` | [plan/](plan/) |
| `research/execution-strategy/phase-NN-hand-off.md`, `research/execution-strategy/stage-12x-hand-off.md` | [hand-offs/](hand-offs/) |
| `research/local-consumer-testing.md` | [testing/local-consumer-testing.md](testing/local-consumer-testing.md) |
| `research/scripts/` | [scripts/](scripts/) |
| `research/profiles/` | `profiles/` |
