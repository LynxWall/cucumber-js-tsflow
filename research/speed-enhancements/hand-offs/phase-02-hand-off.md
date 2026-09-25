# Phase 2 hand-off

Part of the [Performance Enhancement Execution Strategy](../performance-enhancement-execution-strategy.md).

Written at the end of the Phase 2 session so that the Phase 3 session can start cold.

## State of the tree

- Still on branch `2026-09-performance-enhancements`. Phase 1 was committed as `cfcf8c0` ("Timing add +
  isVerbose updates"). At the time of writing the Phase 2 changes were **uncommitted, pending code review**;
  check `git log` and `git status` before assuming either way.
- `yarn build` clean, no stray `.js` under `src/`; `yarn test:all` green on all sixteen variants; ESLint and
  Prettier clean on every changed file; `tsc --noEmit` clean.
- Files changed: `src/runtime/message-collector.ts`, `src/runtime/utils.ts`, `src/runtime/test-case-runner.ts`,
  `src/bindings/binding-registry.ts`, `src/bindings/binding-decorator.ts`, `src/bindings/step-decorators.ts`,
  `src/bindings/hook-decorators.ts`, plus `CHANGELOG.md` and one line in `Architecture.md`.

## What Phase 2 landed

- **Item 2.** `MessageCollector` gained a `currentScenarioContext` field, set in `startTestCase` and cleared
  in `endTestCase` and `reset`. `getStepScenarioContext()` now takes no argument and returns that field; the
  pickle scan, its `hasMatchingStep`/`hasMatchingTags` calls and the `stepHasTags` helper are gone. Both
  call sites (`test-case-runner.ts` and the step wrapper in `binding-decorator.ts`) were updated. The
  behavior change is recorded in the changelog: steps always get the running scenario's context, and the
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

## Measured effect on the large suite

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

Two conclusions, and the first matters for how the rest of the execution strategy is read:

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

## Notes specific to Phase 3

- Nothing in Phase 2 touched the loaders, the `.mjs` files, or an IPC contract, so the Phase 1 timing
  plumbing is unchanged and the `esm:*` phases and file tables are directly comparable across phases.
- Phase 3 is where the numbers above say the time actually is: `support:import` at 26–142 s and `esm:load`
  at ~35 s for 921 files (both runs) dwarf everything else in the report. Item 3 (`files: true`) shows up as
  `esm:hooks-init` and per-process start; items 6 and 7 as `esm:resolve` (5 s over 2828 calls here).
- The `dim-*.log` files with the full reports were written to the session scratchpad and are not preserved;
  the table above is the record.
