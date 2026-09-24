# Phase 1 hand-off

Part of the [Performance Enhancement Execution Strategy](../performance-enhancement-execution-strategy.md).

Written at the end of the Phase 1 session so that the Phase 2 session can start cold.

## State of the tree

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

## What Phase 1 landed

- **Item 1.** New [tsflow-timing.ts](../../cucumber-tsflow/src/utils/tsflow-timing.ts) with an `.mjs` twin
  for the ESM loaders. Both share one store per thread on `globalThis.__TSFLOW_TIMING`, the same singleton
  pattern as the registry, so the bundled `esbuild-transpiler-cjs.js` records into the same store as the
  loader that bundled it. Cross-boundary channels: the ESM hooks thread reports over a `MessageChannel` port
  passed as `module.register()` `data` and received by a new `initialize` export on all four loaders;
  preload workers add a `timing` field to their `LOADED` response; parallel children send a new `TIMING`
  IPC message before `READY`, handled in
  [adapter.ts](../../cucumber-tsflow/src/runtime/parallel/adapter.ts) via the widened
  `TsFlowWorkerToCoordinatorEvent` union in `runtime/types.ts`. The report prints to stderr from
  `runCucumber()` so both the CLI and the programmatic API get it.
- **Item 12.** Per-file `logger.checkpoint` calls in `loader-utils.mjs`, `esbuild.mjs`,
  `esbuild-transpiler.mjs`, `tsnode-loader.mjs`, `vue-loader.mjs` and `vue-sfc-compiler.ts` are behind a
  module-level `const verbose = isVerbose()`. Module-init and error/warn calls were left alone.
- **Item 13.** Only the `cucumber-tsflow-specs` line was deleted from the ESM `supports()`. The two
  `supports()` exports were not reconciled and still have no consumer.
- Docs: `CHANGELOG.md` has an `[Unreleased]` section, `Architecture.md` has a new "Diagnostics" section
  with the context/scope/channel table, and `README.md` has a short "Startup timing diagnostics" subsection.

## Using `TSFLOW_TIMING` in later phases

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
  shape, not the ratings in [ratings.md](ratings.md). The large real-world testbed is the UIS Tools VueApp, wired in
  with the project skill `pnpm-link-consumer` (see `.claude/skills/`). Phase 2's item 2 figures in
  particular can only be reproduced at hundreds of scenarios.

## Notes specific to Phase 2

- Phase 2's wins are runtime and registration hot paths, so they show up as a drop in `runtime:run`
  (items 2, 4, 9), `registry:update` (item 5) and `support:require`/`support:import` (item 11, since
  decorator registration happens at load time). There is no per-step or per-binding breakdown in the
  report; if one is needed, add a phase with `startTimer()`/`recordPhase()` rather than a new mechanism.
- Take a `TSFLOW_TIMING` baseline on the large suite _before_ touching item 2, once per profile you care
  about, and keep the output. Nothing in the spec matrix will show the difference.
- Item 2 changes behavior, not just speed: today `getStepScenarioContext` can resolve to a _different_
  scenario's context when a step pattern matches text in another pickle. Any support code that has come to
  depend on that accident will change behavior. Say so in the changelog.
- None of the Phase 2 items touch a loader, the `.mjs` files, or an IPC contract, so the Phase 1 timing
  plumbing should not need to change. If it does, the `.ts` and `.mjs` twins must be edited together.
- Build with `yarn build`, never bare `tsc`; run `yarn test:all` before calling the phase done; both
  decorator modes must keep working (the `*-exp*` workspaces catch regressions).
