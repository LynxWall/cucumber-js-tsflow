# Stage 12e hand-off

Part of the [Performance Enhancement Execution Strategy](../performance-enhancement-execution-strategy.md).

Written at the close of the stage (2026-09-24). Stage 12e is
[Documentation and packaging](../plan/phase-12-plan.md#12e-documentation-and-packaging): the performance guide, the README
reduced to a paragraph that links to it, Architecture.md and the CHANGELOG read as one product, the contributor
documentation, the repeatable benchmark, the packed-tarball smoke test, and the shipped agent skill checked against
the tree and linked into the UIS testbed. **The stage is complete and its gate is met, with one box that only the
owner can tick: reading the guide, the README paragraph and the skill.**

## State of the tree

- Branch `2026-09-speed-enhancements`. 12e is one commit, `7d48a3d`, squashed from the stage's working
  commits on top of `4dcf1a0`, the 12d documentation commit; this document's commit follows it. The tree of the
  squashed commit is byte-identical to the last working commit.
- The cadence held on the final tree: `yarn build` from a clean `lib/` with no stray `.js` under `src/`,
  `yarn typecheck` clean, `yarn lint` clean (the two new scripts are now in its globs), `yarn test:unit` green at
  **261 tests**, `yarn test:node:cjs-esbuild` 31 of 31 and `yarn test:node:esm-esbuild` 25 of 25 (the two
  workspaces whose `cucumber.json` gained a profile, and the transpilers the smoke test uses), and
  `yarn smoke:tarball` green: 26 tarball checks, and in each of the CommonJS and ESM projects the skill and the
  `bindings` stub installed, the feature passed from the installed `cucumber-tsflow` and the step and context files
  type-checked (its first run failed on the ESM project; see "The package").
- Twenty-two files changed or added. New: `docs/performance-and-diagnostics.md`, `scripts/benchmark.mjs`,
  `scripts/smoke-test-tarball.mjs`, `cucumber-tsflow/CHANGELOG.md` and `cucumber-tsflow/LICENSE` (build output,
  committed). Changed: `README.md` and its copy `cucumber-tsflow/README.md`, `Architecture.md`, `CHANGELOG.md`,
  `CLAUDE.md`, `CONTRIBUTE.md`, the root and library `package.json`, the `cucumber.json` of the `node`,
  `node-esm`, `vue` and `vue-esm` spec workspaces, the skill's `references/running-and-debugging.md`, and two
  source files for one string each: `src/cli/argv-parser.ts` and `src/runtime/test-case-runner.ts`, and
  `src/transpilers/esm/loader-utils.mjs` for the lazy Vue compiler load. No test changed; the only behavior
  change is that `es-node-esm` starts without `vue` installed.
- The shipped agent skill was re-read against the tree (see below); one paragraph was added to it.

## What landed

### The performance guide

`docs/performance-and-diagnostics.md`, 200 lines, from the README's 94-line block. The seven sections moved
across nearly verbatim (they were written and reviewed in Phases 6 to 10), with three corrections: the compile
cache and transpile cache paragraphs no longer say that preload threads share the caches (the preload was removed
in Phase 8); the selective-loading list of what always loads no longer says "or the CucumberJS functions" beside
the hook decorators, which read as though functional `Before()`/`Given()` work when the runner throws
`Unable to find StepBinding!` for any step or hook without a binding (the parameter type, World constructor,
default timeout and definition wrapper it does list are the CucumberJS functions that do work, re-exported from
`bindings`); and the startup-progress section gains the `[ ✗ ]` failure mark from 12b. Three sections are new:

- **Cache operations**, the item the stage definition added: where the cache root is and how it is chosen (the
  nearest `node_modules` at or above the working directory, else the nearest `package.json`'s directory, else the
  OS temp directory, read from `getCacheRootDirectory()`), a table of the three caches with contents, location,
  switch, bound and how to clear each, and the answer to the definition's question: the selective-load index is
  **not** bounded the way the transpile cache is. Each index file is small and there is one per distinct
  configuration; an upgrade leaves the previous version's files behind in both stores. Clearing is never needed
  for correctness, and `--no-transpile-cache` / `--no-selective-load` rule a cache out for one run without
  deleting anything.
- **Environment variables**, every one the source reads (`grep process.env` over `src` and `bin`), including the
  three `NODE_*` ones the command sets or honors.
- **Measuring startup on this repository**, with `yarn bench` and the reference table (below).

The timing section also gained a walkthrough of the report's three tables, from a real run of the `node`
workspace, so that a reader can tell `bootstrap` from `support:require` and a hit count from a time.

### The README

Reduced by 55 lines to 1069, written with CRLF as the stage definition asked. The block is one paragraph under
`### Performance and diagnostics` that links to the guide with an absolute GitHub URL (the README is also the npm
package's README, where a relative `docs/` link would break; the existing ESM loaders link set the precedent). The
configuration table's three anchors point at the guide. Both leftovers from 12c are done: the 7.7.0 release notes'
**Parallel preload** bullet says "removed in 7.8.0, see above", and a `## Release Updates (7.8.0)` section above it
summarizes the release in four short lists (faster startup, new features, fixed, deprecated and removed), so the
README's own release history reads correctly and the removal is visible where the feature was announced. One
sentence after the install note points at the shipped skill and `npx skills-npm`. The one line the stage
definition flagged, "the CucumberJS functions", is gone with the block.

### The package

- **`yarn build` produces `cucumber-tsflow/README.md`** (`build:copy-docs`, `shx cp`), and the two copies are
  byte-identical after the build, which is the exit criterion. The same step copies `CHANGELOG.md` and `LICENSE`,
  because of a finding the smoke test's first dry run surfaced: both were in the package's `files` list but live at
  the repository root, outside the package directory, so **no published version of the package has carried a
  CHANGELOG or a LICENSE file**. The copies are committed so that the package directory is always publishable
  (both publish workflows run `yarn build` first regardless).
- **`yarn build` cleans `lib/` first** (`shx rm -rf lib`). The tarball listing showed `tsc --build` never removing
  the output of a deleted or renamed source: `lib/formatter/step-definition-snippit-syntax/` (the misspelled folder
  renamed in 7.7.0) and the whole `lib/transpilers/vue-sfc/` tree (consolidated into `vue-sfc-compiler.ts` in
  7.6.0) were still there and **shipped in every tarball built from a long-lived checkout**. The smoke test now
  checks that every file under `lib/` has a source file. The clean build costs about two seconds more.
- **`es-node-esm` failed in a project without `vue`**, the ESM smoke project's first run: `loader-utils.mjs`, shared
  by all four ESM loaders, required `vue-sfc-compiler.js` (and so `vue/compiler-sfc`) as it initialized, and `vue`
  is an optional peer dependency since 12d. Every spec workspace shares the monorepo's `node_modules`, where `vue`
  is always present, so the sixteen-variant matrix could never see it; a consumer running `es-node-esm` without Vue
  got `Cannot find module 'vue/compiler-sfc'` at startup. The compiler is now required on the first `.vue` load.
  This is the finding that justifies the smoke test's cost.
- The `--transpiler` help text listed seven transpilers and left out `ts-node-esm`, which the option accepts; and
  the two `Unable to find StepBinding!` errors carried `===268 test-case-runner.ts` debugging prefixes. Both are
  consumer-visible strings the skill quotes or the README documents, so both were fixed here, one line each, and
  recorded in the CHANGELOG.

### Architecture.md and the CHANGELOG as one product

Architecture.md: the two remaining phase-sequence phrases ("which it now always does", "as it already
deduplicated") are gone; the CLI section lists every option the CLI adds, including the deprecated hidden
`--parallel-load`; the Diagnostics section opens with a pointer to the guide; the monorepo section lists `docs/`
and `scripts/` and states what the build produces; and finding G's rule is written up as **Caches and the reload
reset** at the end of the Transpilers chapter: a cache is reset on reload when its key is a path or specifier whose
meaning depends on the project's files, kept when the key determines the value, and kept on purpose when it holds
configuration read at startup. Every module-level cache in `src` (twenty, from a grep for module-level `Map`,
`Set` and `let` stores) is placed in one of the three lists with its reason. Nothing was unified, as triaged.

CHANGELOG `[Unreleased]`: five `Fixed` entries and one `Changed` entry described changes to things this same
release introduces (the failure mark and the launch-phase line for the new progress output, the quit-after-failure
exit code and the loader-naming notice for the new watch mode, the pattern-key fix for the new selective loading,
the in-thread placement of the new timing report's rows). Each was folded into the entry that introduces the
feature or dropped, so a 7.7.2 user reads what changed for them, not the branch's history. The `Removed` entry for
the preload no longer names progress phases and report sections the preload never shipped with; the
`reloadSupport()` entry no longer carries the unrelated ESM step-location fix, which is its own entry; and four
entries were added: the skill, the guide with the two scripts, the CHANGELOG/LICENSE packaging fix, and the two
string fixes.

### Contributor documentation

CONTRIBUTE.md rewritten (its `yarn test` is gone; it lists what is where, every root script including `bench` and
`smoke:tarball`, the pull-request checklist with the documents to update, the skill rule, and how the release
workflows build and publish). CLAUDE.md: `docs/` and `scripts/` in the layout, the two scripts in the command
table, the document copies in the build rules, and the sentence calling CONTRIBUTE.md out of date removed. The
skill maintenance rule the definition asked to put to the owner and Lonnie is in CLAUDE.md, CONTRIBUTE.md and
`.github/copilot-instructions.md`, and the CHANGELOG entry for the skill states it in one sentence.

### The benchmark script

`scripts/benchmark.mjs`, `yarn bench [--workspace node|node-esm|vue|vue-esm] [--runs N] [--cold] [--report]`.
It runs the workspace's new `bench` profile (every feature of the variant except the `@cli-run`, `@watch` and
`@reload` ones, which spawn their own CLI processes; progress formatter, no report files) under `TSFLOW_TIMING`
and `TSFLOW_THEME=off`, parses the main process's phase table, and prints one row per run: wall time, the report's
total, `bootstrap`, `config`, `gherkin`, the support phases, `registry:update`, `formatters:init`, `runtime:run`,
and the transpile-cache hit and miss counts. `--cold` points run 1 at an empty transpile cache **and** an empty
Node compile cache in a temporary directory that runs 2 and 3 then share, so one table shows cold then warm. The
reference table in the guide was taken with it on the four workspaces; the notable figure is the `vue` workspace's
cold `support:require-modules` of 25.7 s, which is V8 compiling jsdom and Vue with an empty compile cache, a cost
a project's normal cold run does not pay because its compile cache is intact. Warm, the four workspaces start in
0.8 to 1.9 s, half of it `bootstrap`.

### The packed-tarball smoke test

`scripts/smoke-test-tarball.mjs`, `yarn smoke:tarball [--keep]`. It runs `yarn workspace @lynxwall/cucumber-tsflow
pack` into a temporary directory, lists the tarball with Node (Git for Windows' `tar` treats a `C:` path as a
remote host, which is how the first run failed), checks 24 required entries (the bin, the stubs, the `.mjs`
wrappers, the four loaders, the worker script, the skill's five files, README, CHANGELOG, LICENSE), that nothing
development-only ships (`src/` other than a README, `test/`, tsconfig files, `.test.*`), and that every file under
`lib/` has a source. Then, for a CommonJS project (`es-node`, `require` globs, `moduleResolution: node` so the
`bindings/index.d.ts` stub is what TypeScript sees) and an ESM project (`"type": "module"`, `es-node-esm`, `import`
globs, `moduleResolution: bundler` so the `exports` map is), it `npm install`s the tarball, writes a feature, a
context class with `initialize`/`dispose` and a step class importing from `@lynxwall/cucumber-tsflow/bindings`
with an extensionless relative import, runs `cucumber-tsflow -p default` from the installed bin and asserts
`1 scenario (1 passed)`, then type-checks the project with the repository's `tsc`. The two installs fetch the
dependency tree from the registry, so the script takes a few minutes and needs the network; it is not a CI step.

### The shipped agent skill

Re-read against the tree after 12d: every decorator signature (`step-decorators.ts`, `hook-decorators.ts`), the
`bindings` re-exports, the context lifecycle (`managed-scenario-context.ts`), the `{boolean}` parameter type, the
exit codes (`cli/run.ts`), the four quoted error messages, the CLI options and their help text, the environment
variables, the cache paths and the transpiler table match the source. Two things it quotes were wrong in the source
rather than in the skill and were fixed there (above). One paragraph was added to `running-and-debugging.md`
pointing at the guide. The skill is linked into the UIS testbed: `corepack pnpm dlx skills-npm@1.2.0 --agents
claude-code --yes` in `Tools.Web/VueApp` of the UIS Tools repository scanned ten packages, found the one skill and
created `.claude/skills/npm-lynxwall-cucumber-tsflow-cucumber-tsflow` as a symlink into
`node_modules/@lynxwall/cucumber-tsflow/skills/cucumber-tsflow` (which is itself the pnpm `link:` to this
checkout, so the link is live); it also added a `skills/npm-*` pattern to that workspace's `.gitignore`. Both are
uncommitted changes in the uis-tools repository. An agent (Sonnet, read-only) was then given a step-definition
task in the UIS `test` package and told to load the skill through that link: it read `SKILL.md` and the
`bindings-and-context.md` reference through the symlink, followed the skill's "Before you write anything" steps
against the project (`cucumber.json`'s `utils` profile, two existing step files, the injected `ScenarioContext`,
`tsconfig.json`), correctly identified legacy decorator mode agreed in both places, `es-vue-esm` and `import`
globs, applied the one-class-per-file, context-listed-in-`@binding`, never-`@cucumber/cucumber` rules, and wrote
a step class and a context class in the project's conventions. Its one observation is worth keeping: the UIS
suite still uses what the skill calls the older pattern (a context filled from a `@before` hook rather than its
constructor), and the skill describes both, so an agent there follows the recommended pattern for new code
while reading the old one correctly.

## Findings this stage surfaced

Fixed here: `es-node-esm` in a project without `vue`; the missing CHANGELOG and LICENSE in the package; stale
`lib/` output shipping; the `--transpiler` help text; the `StepBinding` error prefixes; and, in the follow-up,
stale source maps after a CommonJS re-evaluation. Recorded for the owner, not done:

- **Stale source maps after a CommonJS re-evaluation: reproduced and fixed** (follow-up commit `cbd9b45`,
  at the owner's request on reading this hand-off). A scripted `--watch` session on the `node` workspace with three
  lines inserted above the step class reported every one of the nine definitions at its old line after the rerun,
  while a fresh process and the ESM workspace reported the new ones. The cause: the CommonJS transpilers run under
  ts-node, which installs `@cspotcode/source-map-support` with a `retrieveFile` that reads its in-memory output;
  that library keeps the parsed map of every file in a store on `globalThis`
  (`Symbol.for('source-map-support/sharedData')`, keyed by the file's URL) for the life of the process, and
  `Callsite` maps CommonJS frames through its `wrapCallSite`, so a re-evaluated file's decorators mapped through
  the previous version's map. `reloadSupport()` had the same defect. `evictRequiredModules()` now forgets the
  store's entries for each module it evicts (`forgetSourceMap()`, best-effort against the store's shape). A unit
  test covers the eviction and a scenario in both watch features (`Reported step locations follow an edit`)
  asserts that every reported line points at its decorator before and after a three-line shift. The
  Architecture.md cache rule gained the entry.
- The tarball also carries `src/transpilers/esm/README.md` (Yarn packs every `README*`) and
  `lib/tsconfig.node.tsbuildinfo`; both harmless, both for Phase 13's package-size pass, where a `files`
  negation pattern would drop the second.
- The 12c and 12d owner items stand (finding P; the `EPERM`/`EBUSY` retry; the per-thread `loadConfig()` calls;
  the two cosmetic items).

## Notes specific to 12f and the owner

- **Gate, item by item:** the tarball runs a feature in fresh CJS and ESM projects and contains `skills/`
  (`yarn smoke:tarball`, above); the skill matches the shipped behavior and skills-npm links it in the UIS testbed
  (above); CONTRIBUTE.md and CLAUDE.md match the scripts. **Open for the owner:** read the guide
  (`docs/performance-and-diagnostics.md`), the README's `### Performance and diagnostics` paragraph and its new
  `## Release Updates (7.8.0)` section, and the skill (`cucumber-tsflow/skills/cucumber-tsflow/`). The README
  section assumes the version decision 12f has yet to take is 7.8.0, the minor release the rule from 12c group 2
  implies; if 12f decides otherwise, its heading and the "removed in 7.8.0" note are the two places to change.
- **For the 12f release checklist:** `yarn smoke:tarball` as a box, after the version bump and before the tag;
  the skill re-read as a box, as the plan already says; `yarn build` before `pack` or `publish` always, since the
  package directory's README, CHANGELOG and LICENSE are build output; the `Release Updates (7.8.0)` README section
  and the CHANGELOG heading and date; and, outside this repository, whether the uis-tools `.gitignore` change and
  the skill symlink skills-npm made are kept or reverted (delete the symlink, revert the one `.gitignore` line).
- **The skill maintenance rule** for Lonnie is stated in CLAUDE.md, CONTRIBUTE.md,
  `.github/copilot-instructions.md` and the CHANGELOG entry: a change a consumer can see updates the skill in the
  same commit, every review checks it against the diff, and it stays one skill with references. The pull request
  description should point at it, since that is what he reads first.
- **Working notes for the next session** (the assistant's tooling on this machine): Git for Windows' `tar`
  refuses `C:\…` paths (`Cannot connect to C: resolve failed`), so list tarballs with Node; the file-writing tool
  writes LF, so a document meant to be CRLF (the README, the guide, CONTRIBUTE.md; `.gitattributes` normalizes on
  commit either way) is converted with a two-line Node script afterwards; edits to CRLF files were again applied
  through a small Node script doing exact single-occurrence replacement with the line ending preserved; `corepack
  pnpm dlx skills-npm@1.2.0` works from the UIS workspace root without installing anything there; a `yarn pack
  --dry-run` lists the tarball without producing it and is the quickest packaging check.
- The commit workflow from 12c was followed: working commits inside the stage, one squashed commit before this
  document, this document's commit, then the push. Nothing already pushed was rewritten. The source-map follow-up
  (`cbd9b45`) came after the push, at the owner's request, and is its own commit; the cadence held after it
  (`yarn build`, `yarn typecheck`, `yarn lint`, 262 unit tests, `yarn test:node:cjs-esbuild` and
  `yarn test:node:esm-esbuild` with the new scenario).
