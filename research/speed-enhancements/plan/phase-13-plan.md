# Phase 13 plan

Part of the [Performance Enhancement Execution Strategy](../performance-enhancement-execution-strategy.md).

Session starter for Phase 13, written 2026-09-29: the two decisions the owner made at the start of the session,
the scope as revised by them, the baseline to take before anything changes, and the exit criteria. The phase was
first named in the 12d hand-off and given a provisional scope in the map; this document replaces that provisional
scope.

## Decisions taken at the start of this session

- **Phase 13 lands inside pull request #68, before it goes to Lonnie**, not as a follow-up opened after the tag,
  which is how the map described it until now. [owner, 2026-09-29] Reasoning: everything else on the branch is
  already staged for one review, and the point of Phase 12's whole-product pass was to hand the maintainer one
  coherent diff rather than a sequence of them; a second pull request right behind the first would split his read
  across two related reviews instead of one. The pull request description drafted in the 12f hand-off is rewritten
  once, after Phase 13's commits land, rather than posted now and revised later.
- **The VS Code extension is out of scope for this phase, in full** — not a "for a later major" item as the
  release review first listed it. [owner, 2026-09-29] The owner opened a separate JIRA ticket for it, to be done
  on its own branch, since it is a different project (`cucumber-tsflow-vscode`) with its own release cycle. The
  8.0.0 upgrade notes already tell its users to stay on 7.x until it is updated for the new loading model
  (`loadSupport`/`reloadSupport` starting from an empty registry); that note stands as written and needs no change
  here.

## What this changes about the release checklist

- Section D of the [stage-12f checklist](../hand-offs/stage-12f-hand-off.md#d-branch-hand-off-and-pull-request)
  ("pull request description written, draft flag removed") stays open until Phase 13's commits are also on the
  branch, so the description Lonnie reads covers both. Pull request #68 stays a draft with an empty description
  until then (confirmed still true 2026-09-29 via the GitHub API).
- Section A's remaining open box (the owner's reading of the guide, the README section and the skill) does not
  depend on Phase 13 and can happen in parallel.
- Section E (Lonnie's merge, tag, publish) is unaffected in shape, only in timing: it now follows a slightly
  larger pull request.

## Scope

Unchanged from the provisional list in the map for items 1 through 3; the VS Code extension item is removed
entirely rather than deferred; the two later-major items are untouched by this phase.

1. **Build time.** What `yarn build` costs (`genversion`, `tsc --build`, the `.mjs` copies) and what a watch build
   costs per change. Baseline first, below, before proposing any change.
2. **Package size.** The packed tarball's bytes and file count (`yarn smoke:tarball` already produces the
   tarball; its own report or `yarn pack --dry-run` gives the number without a full smoke run), the module count
   and bytes a consumer loads for `import { binding }` and for the CLI, and the runtime dependency tree's install
   footprint. Candidates to look for: declaration-only files that ship compiled instead of as `.d.ts`, unused
   exports, and dependencies that could be optional (Vue-only pieces gated behind the `vue` peer dependency, for
   instance).
3. **Dependency health as a standing check**, the largest item, continuing what 12d started:
   - `yarn npm audit` clean (12d already got it there; keep it clean as dependencies move).
   - `yarn install` without warnings. ESLint 9 is deprecated on the registry (the tree currently pins
     `eslint ~9.39.5`); migrating to ESLint 10 is the first sub-item, and needs `eslint-plugin-vue`
     (`~10.0.0`), `@vue/eslint-config-typescript` (`~14.6.0`) and `vue-eslint-parser` (`10.1.1`) checked for
     ESLint 10 compatibility before the bump, not just the `eslint` package itself.
   - No undeclared imports, no unused declared dependencies — 12d's audit pass is the precedent to repeat, not
     redo from scratch.
   - The four `@cucumber/*` pins in `cucumber-tsflow/package.json`
     (`@cucumber/cucumber-expressions` `19.0.0`, `@cucumber/gherkin` `38.0.0`, `@cucumber/messages` `32.0.1`,
     alongside `@cucumber/cucumber` `~12.7.0` itself) checked against what `@cucumber/cucumber@~12.7.0` pins for
     the same three packages, so tsflow never carries a version CucumberJS itself has moved past.
   - `release.yml` updated off `actions/checkout@v2` and `actions/setup-node@v3` (a Node 16 runtime GitHub has
     retired) to current actions, or deleted outright. The 12f hand-off left this as an open choice, not a
     foregone deletion, since `publish.yml` is the confirmed release path and `release.yml` has never been used
     for a real release (not for 7.7.0 through 7.7.2). Make the call here.
   - The package's committed `README.md`, `CHANGELOG.md` and `LICENSE` copies checked identical to the root files
     after `yarn build`, ideally as a script that can run in CI (12f found the CHANGELOG copy one entry behind
     once already, after a follow-up commit edited the root without rebuilding).

**Explicitly out of scope for this phase:**

- The VS Code extension — separate JIRA ticket, separate branch, a different project. See the decision above.
- Closing the `./lib/*` wildcard export and removing `parallelLoad`: both stay "for a later major" per the
  release review, untouched by this pass.
- **Migrating the monorepo's own tooling from Yarn to pnpm.** Raised by the owner while scoping this phase,
  then held off (2026-09-29): "we can hold off on the yarn stuff... it could be its own ticket one day." Not
  started, not a Phase 13 item. The lift, if it is ever picked up: `.yarnrc.yml`/`.yarn/`/`yarn.lock` replaced by
  `pnpm-workspace.yaml`/`.npmrc`/`pnpm-lock.yaml` and the `packageManager` field; the root `package.json`'s roughly
  thirty `yarn workspace <name> <script>` invocations rewritten to pnpm's `--filter` syntax, not just renamed;
  `scripts/smoke-test-tarball.mjs`, which shells out to `yarn workspace @lynxwall/cucumber-tsflow pack` and checks
  the tarball for a `.yarn` directory; `ci.yml`, `publish.yml` and `release.yml`, which all run
  `yarn`/`yarn build`/`yarn test:all`; and roughly forty files of documentation, led by CLAUDE.md's commands
  table. The one argument for it: pnpm's stricter `node_modules` layout would re-verify the phantom-dependency
  fixes 12d already made. This is not a Phase 13 problem to solve — `yarn npm audit` is already clean — and
  a package-manager migration is a different risk profile from anything else in this phase, so it belongs in its
  own follow-up, not folded into what is about to go to Lonnie.

## Follow-ups from the final review pass (2026-10-02)

Findings of the maintainer-persona review of pull request #68, taken before it left draft, that were not fixed on
the branch. Each names what would resolve it, so it can become a ticket as it stands.

- **`enableVueStyle` reaches neither the loader hooks thread nor parallel children.** `loadConfiguration` writes
  only `global.enableVueStyle`; `loader-utils.mjs` reads the global or `CUCUMBER_ENABLE_VUE_STYLE`, which nothing in
  `src/` sets, and `esvue.ts`/`tsvue.ts` read only the global, which a child never sets. So `.vue` styles compile
  off under `ts-vue-esm`, under `es-vue-esm` with async hooks and in every parallel child, whatever the option
  says, and the transpile cache (keyed on the flag) holds different entries for coordinator and children.
  Pre-existing on master. Resolve as the decorator mode was resolved in 8.0 (`decorator-mode.ts`): one accessor
  backed by an environment variable that `loadConfiguration` sets and every reader uses, plus Vue spec coverage in
  a parallel profile with `enableVueStyle: true`.
- **Vue cache entries are not pure functions of the `.vue` source.** With `enableVueStyle: true` and
  `<style lang="scss">`, sass resolves partials from disk and their content lands in the entry without being in
  the key; `transformImports` bakes the result of file-existence probing into the `vue-sfc-esm` entry. Narrow in
  practice. Resolve by bypassing the cache for preprocessed styles (or keying on the resolved partials) and by
  naming the exception in the guide's "a stale entry is never served".
- **`ENTRY_FORMAT` is the only recipe version in the cache key.** `tsflowVersion` does not move between local
  builds, so a linked consumer keeps serving the previous build's output after a change to `rewritePathMappings`,
  `transformImports` or the Vue assembly. Resolve by bumping `ENTRY_FORMAT` whenever the recipe changes (and
  saying so in its comment) or by adding a recipe constant.
- **`reloadSupport()` under a loader on the hooks thread.** With `ts-node-esm`, `ts-vue-esm` or
  `TSFLOW_ESM_HOOKS=async` no import edges exist, so `dependentProjectModules()` returns nothing and a changed
  dependency keeps its old instance; watch mode guards this with `SupportReloader.unsupportedReason()`, the API
  does not. Resolve with the same check in `loadSupportCode` (throw, or document the limit in the API's JSDoc).
- **The watch-mode child-process fallback drops `process.execArgv`**, so
  `node --max-old-space-size=8192 bin/cucumber-tsflow.js --watch` loses the flag on every run, and the
  `parallelLoad` notice repeats per run. Resolve by spawning with `[...process.execArgv, script, ...]`.
- **`selectiveLoad: true` on the main matrix profiles** (`esnode` in `node`, `esnodeesm` in `node-esm`) makes the
  matrix depend on an index under `node_modules/.cache` that a fresh CI checkout never has: always a full plan in
  CI, a selective plan on a warm local tree. Decide whether the matrix should stay deterministic (leave selective
  loading to `selective-load-test.feature`) or keep the dogfooding.
- **Step locations under `ts-node-esm` and `ts-vue-esm`** stay `file:` URLs with the lines of the compiled output,
  because ts-node's maps live on the hooks thread. Pre-existing; the CHANGELOG says so. Resolve by relaying
  ts-node's maps as `source-map-relay.mjs` does for the esbuild loaders.
- **The consumer's name in the repository.** The README, CHANGELOG and guide do not name the suite the numbers
  come from, but the guide links to `research/speed-enhancements/measurements/uis-tools-7.5.5-vs-8.0.0.md` and the
  research folder names it throughout. Decide one way or the other.

## Before changing anything

Per the phase's original framing in 12d ("measured before anything is changed"), take a baseline on the tree as
it stands after today's branch-divergence fix (a merge commit reconciling a same-timestamp amend to the release
review that had only been pushed to `origin`, not pulled here):

- A clean `yarn build` timing (a cold run; note whether any build cache exists to clear first).
- One `yarn build:watch` start plus one single-file touch, timed.
- The packed tarball's byte count and file count, from `yarn smoke:tarball` or `yarn pack --dry-run`.

Record these numbers here or in a short measurement note before proposing any change, the same discipline the
rest of the branch has used throughout.

## Exit criteria

- `yarn npm audit` clean; `yarn install` free of deprecation warnings.
- The four `@cucumber/*` pins agree with what `@cucumber/cucumber` itself pins.
- `release.yml` either updated to current actions or removed, with the reasoning recorded either way.
- The package-copy check exists as a script that can run locally and, if the owner agrees, in CI.
- Build-time and package-size numbers recorded, with any change made and its measured before/after.
- `yarn build`, `yarn typecheck`, `yarn lint`, `yarn test:unit`, `yarn test:all` and `yarn smoke:tarball` all
  green on the tree that then joins pull request #68's diff.
- Architecture.md and the shipped skill checked against whatever changed, per the standing rule (a
  consumer-visible change — a dependency version a consumer's own lockfile would resolve differently, a changed
  CI action, and so on — updates them in the same commit).
