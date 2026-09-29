# Phase 13 hand-off

Part of the [Performance Enhancement Execution Strategy](../performance-enhancement-execution-strategy.md).
Executes the [Phase 13 plan](../plan/phase-13-plan.md), written earlier the same day (2026-09-29). The whole
phase is one squashed commit, `4286f0a`, on `2026-09-speed-enhancements`.

## What was done

Everything in the plan's scope, in one pass. The measured record is
[phase-13-baseline.md](../measurements/phase-13-baseline.md); the commit message on `4286f0a` lists each finding.
In brief:

1. **Baseline** (taken before any change): `yarn build` is always a full compile because its clean step removes
   `lib/` including the tsbuildinfo — 17–19 s warm, 47 s truly cold; a watch rebuild after a one-file touch is
   5.0 s; the tarball was 295,628 bytes / 240 files, 1.32 MiB unpacked with source maps at 48%; a consumer loads
   225 modules for the bindings entry against 528 for the package root; a fresh install is 229 packages /
   83.4 MiB.
2. **ESLint 10** (ESLint 9 is deprecated on the registry): `eslint ~10.11.0`, `eslint-plugin-vue ~10.11.1`,
   `@vue/eslint-config-typescript ~14.9.0`, `vue-eslint-parser 10.4.1`, `@eslint/js ^10.0.1`,
   `@eslint/eslintrc ^3.3.7`, `eslint-config-prettier ~10.1.8` — each checked for declared ESLint 10 peer
   support before the bump. The four findings from v10's two new recommended rules (`no-useless-assignment`,
   `preserve-caught-error`) were fixed in the source rather than suppressed. `globals`, which
   `eslint.config.mjs` imported as a phantom hoisted from `@eslint/eslintrc`, is now declared (`~17.12.0`).
3. **`release.yml` deleted.** The reasoning, recorded here per the plan's exit criteria: it was never used for a
   real release (not for 7.7.0 through 7.7.2), it ran on retired runtimes (`actions/checkout@v2`,
   `actions/setup-node@v3`), and its publish job had no checkout step, so the `package.json` path it handed to
   `JS-DevTools/npm-publish` never existed on the runner — it could not have worked as written. `publish.yml`
   (tag push, OIDC provenance, build and full matrix first) is the confirmed release path, so the broken
   duplicate was removed rather than modernized.
4. **`yarn check:package-docs`** (new script, `scripts/check-package-docs.mjs`): the committed `cucumber-tsflow/`
   copies of README.md, CHANGELOG.md and LICENSE must be byte-identical to the root files. CI runs it **before**
   `yarn build` — after the build the copies are freshly regenerated and the staleness it exists to catch (the
   12f one-entry-behind CHANGELOG copy) is invisible.
5. **Tarball trimmed** with negated `files` patterns (`!lib/*.tsbuildinfo`, `!src/transpilers/esm/README.md` —
   the packer force-includes READMEs anywhere, so the exclusion names the file): 291,604 bytes / 238 files.
6. **Dependency audit** repeated for the delta since 12d: no undeclared imports, no unused declared dependencies
   (`jsdom` and `typescript` are intentional — consumed through `jsdom-global` and `ts-node-maintained`), the
   four `@cucumber/*` pins agree exactly with what `@cucumber/cucumber@12.7.0` itself pins, `yarn npm audit` has
   no suggestions, and `yarn install` output is warning-free.

## Exit criteria, checked

Every gate ran green on the tree that is now `4286f0a`: `yarn build`, `yarn typecheck`, `yarn lint`,
`yarn npm audit`, `yarn test:unit` (262 pass), `yarn test:all` (full matrix), `yarn smoke:tarball` (pack,
fresh CJS and ESM installs, a feature run and a type-check in each). Architecture.md and the shipped skill were
checked against the diff and need no update: nothing in this phase is consumer-visible (the shipped
`package.json` changed only its `files` list; every dependency change is a root devDependency).

Deliberate non-changes, so nobody reopens them without new information: source maps stay in the package
(48% of unpacked bytes, but they are what makes consumer stack traces point at `src/*.ts`), and the build's
always-full compile stays as it is (moving the tsbuildinfo out of `lib/` to enable incremental rebuilds risks
TypeScript's known skip-emit-when-outputs-were-deleted behavior for a ~17 s command).

## What remains open after this phase

- **Pull request #68's description and draft flag** (section D of the
  [12f checklist](stage-12f-hand-off.md#d-branch-hand-off-and-pull-request)): Phase 13's commits are now on the
  branch, so the description can be written — but an editorial pass over the public-facing Markdown (README,
  CHANGELOG, the performance guide) was in progress in parallel with this phase, and the description should be
  written after that pass lands so it covers the final state.
- **Section A's owner reading** of the performance guide, the README release-notes section and the shipped
  skill — unchanged, still open, does not depend on this phase.
- The held-off follow-ups recorded in the plan: the yarn→pnpm migration of the monorepo tooling, closing the
  `./lib/*` wildcard export, and removing `parallelLoad` (the latter two for a later major).
