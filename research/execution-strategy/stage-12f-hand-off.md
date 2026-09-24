# Stage 12f hand-off

Part of the [Performance Enhancement Execution Strategy](../performance-enhancement-execution-strategy.md).

Opened at the start of the stage (2026-09-24). Stage 12f is [Release](phase-12-plan.md#12f-release): the release
checklist, written before anything else as the stage's definition says, the real-console verification of the
startup output, the version bump, the final matrix run, and the hand-over to the maintainer who tags and
publishes. **The stage is in progress.** This document is the checklist while the stage runs and becomes the
hand-off when it closes: boxes are ticked here as they close, with the commit or the evidence beside them.

## State of the tree at the start

- Branch `2026-09-speed-enhancements` at `81b7de0`, clean, pushed, 52 commits ahead of `origin/master` and
  nothing behind it. The library's `package.json` says `7.7.2`, the version on the registry (`latest`, published
  2026-03-30 with a SLSA provenance attestation). `engines` is `node >=22.0.0` on both, unchanged by the branch.
- **Pull request #68** (`2026-09-speed-enhancements` → `master`) exists, opened 2026-09-23 as a **draft** with an
  **empty description** and no reviewer requested. CI runs on it as a `pull_request` event on every push: sixteen
  runs so far, every one green, the latest on `81b7de0` with all five matrix jobs (Ubuntu and Windows on Node 22
  and 24, plus Ubuntu Node 24 with `TSFLOW_ESM_HOOKS=async`) successful. The matrix has therefore already judged
  the current head; the boxes below rerun it only for the tree that is tagged.
- The 12e gate has one open box, the owner's reading; it is carried into this checklist.
- The UIS testbed (`C:\Git\Azure\uis-tools\Tools.Web\VueApp`) still holds the two uncommitted changes skills-npm
  made in 12e (the `.claude/skills/npm-lynxwall-cucumber-tsflow-cucumber-tsflow` symlink and the `**/skills/npm-*`
  `.gitignore` line) beside the `link:` dependency and lockfile changes from
  [local-consumer-testing.md](../local-consumer-testing.md), which are never committed.

## The release path

Two workflows can publish, and the checklist picks one.

- **`publish.yml` is the release path.** It runs on a pushed `v*` tag: `yarn`, `yarn build`, `yarn test:all`, then
  `npm publish --provenance --access public ./cucumber-tsflow/` with `NPM_TOKEN`. This is how 7.7.0, 7.7.1 and
  7.7.2 went out: each is an annotated tag by Lonnie Wall on the merge commit into `master` (v7.7.2 on `a9f7946`,
  the merge of pull request #67), and 7.7.2 on the registry carries the provenance attestation that only
  `npm publish --provenance` produces. It requires the tagged commit's `cucumber-tsflow/package.json` to carry the
  new version, since the registry rejects a second 7.7.2; 7.7.2's bump (`9cc07a9`) was made on the feature branch
  before the merge, and 7.8.0's is made the same way, below.
- **`release.yml` is not used.** It is a manual `workflow_dispatch` that runs the same build and tests and then
  publishes through the `JS-DevTools/npm-publish@v3` action, without provenance, and only when the version differs
  from the registry. It still uses `actions/checkout@v2` and `actions/setup-node@v3`, whose Node 16 runtime GitHub
  has retired, so it would need updating before it could be relied on. It is left alone for the release and
  recorded as a Phase 13 dependency-health item (update it to the `v4` actions or delete it).

The steps after the merge belong to Lonnie, who owns the repository and the npm package. Everything before them
is done on this branch, so the pull request he merges already carries the version, the CHANGELOG heading and the
package copies, and the tag is the only act left.

## Release checklist

Owner of each box in brackets: **session** (done here, on the branch), **owner** (the user, a decision or a
reading), **maintainer** (Lonnie, after the merge). A box is ticked with its evidence.

### A. Before the version bump

- [x] **Release checklist written** before anything else in the stage (this document). [session]
- [x] **Real-console verification of the startup output** with the `verify-console-output` skill, after 12d's
  spelling renames in `utils/startup-progress.ts`, done 2026-09-24 on the build of `81b7de0` in fresh conhost
  windows (code page 437, `isTTY=true`), with the screen buffer read back after each run. [session]
  - Preflight passed (glyphs `— … ✓` as single cells, a worker's `tty.WriteStream` fine).
  - The skill's child (four phases in `runCucumber`'s order, a detail with `— … ✓` long enough to wrap at 80
    columns, a 2 s synchronous block, two ticks, `finish()`) at **120, 80, 40 and 24 columns in the default
    theme**: one line per phase at every width, every wrapped line complete with nothing cut, no repeated rows,
    no fragments, `[ ✓ ]` marks and glyphs as single cells, the blank line `finish()` prints, `DONE` at column
    0 and the cursor at column 0 of the row after it.
  - The same child with a **failing load phase** at 80 columns: `[ ✗ ]` in place of the check, the failure
    text in the closing line, the next phase on its own row.
  - The **`lotr` theme at 120 and 40 columns**: the same layout properties hold. Its labels carry emoji, which
    the conhost buffer stores as UTF-16 surrogate pairs and the dump shows as two replacement characters each;
    the rows per phase still match the natural wrap, so the renderer's row counting agrees with the console.
    How the emoji glyphs themselves draw is the terminal's font, outside what the harness can read.
  - The **real CLI** (`bin/cucumber-tsflow.js`, `-p esnode ../features/basic-test.feature` in the `node`
    workspace, selective loading on) at 120 and 80 columns: the dimmed bootstrap notice, `cucumber-tsflow loaded
    in <n>ms.`, the configuration and mode lines, the four phases (`10 support files, 1 feature file`; `3
    scenarios to run`; `6 of 10 support files ... (4 skipped: not used by the selected scenarios) ... 15 of 15
    transpiles from the cache`; `assembling 3 test cases`), the blank line, then the formatter's dots and the
    summary, `3 scenarios (3 passed)`, every line starting at column 0 and wrapped naturally at 80.
  - Not exercised: the 30-second heartbeat quips and the relief lines (a real stall is needed; the renderer's
    state machine is unit-tested with a fake clock), and colors, which the dump does not carry.
- [ ] **The owner's reading** (the open 12e box): `docs/performance-and-diagnostics.md`, the README's
  `### Performance and diagnostics` paragraph and its `## Release Updates (7.8.0)` section, and the skill
  (`cucumber-tsflow/skills/cucumber-tsflow/`, `SKILL.md` and the four references). [owner]

### B. The version decision

- [x] **7.8.0, a minor release.** Applied on the branch under the standing decision from 12c group 2 (the
  branch ships as a minor release, 7.8; nothing published is removed or made an error; `parallelLoad` is accepted
  and ignored with a notice), which the README already assumes. The bump is one commit on an unpublished branch,
  so the owner can still overturn it before pull request #68 leaves draft; the entries to weigh, each documented
  in the CHANGELOG: [owner confirms]
  - the step scenario-context lookup (under "Changed"): steps now always receive the running scenario's context,
    where the old scan could return another scenario's context or none;
  - a `BeforeAll` or `AfterAll` hook that throws now fails the run (under "Fixed"), where it used to be
    swallowed under a passing summary with exit code 2;
  - `./lib/transpilers/esm/esbuild-transpiler` is gone from the `exports` map (under "Removed"): the one
    published path removed on the branch, decided in Phase 5 and documented with its replacement (`es-node-esm`
    or `es-vue-esm`); it was an internal ts-node plugin under `lib/` with no caller left in the library;
  - `ts-node-esm` now passes `files: false` to its ts-node service, overriding a consumer's
    `"ts-node": { "files": true }` for that transpiler (a startup cost with no effect under `transpileOnly`);
  - the ES module entry points no longer export `StartTestCaseInfo`, `EndTestCaseInfo` and `ScenarioContext`
    as runtime values (they were `undefined`; the types are unchanged);
  - four new dependencies (`@cucumber/messages`, `@cucumber/gherkin`, `@cucumber/cucumber-expressions`,
    `xmlbuilder`, at the versions `@cucumber/cucumber` 12.7 pins) and `vue >=3.0.0` as an optional peer
    dependency; `short-uuid`, `import-sync` and `tslib` removed; `engines` unchanged.

  If the decision is not 7.8.0: the README section heading and its "removed in 7.8.0" note under
  `Release Updates (7.7.0)` are the two places to change, plus the boxes below.

### C. The bump, on the branch

- [x] **`cucumber-tsflow/package.json` `version` → `7.8.0`**, and, as at every 7.7.x tag (root, library and
  the eight spec workspaces all read the same version at v7.7.0, v7.7.1 and v7.7.2), the root `package.json` and
  the eight `cucumber-tsflow-specs/*/package.json` with it. The workspaces depend on the library as
  `workspace:*`, so nothing else references the number. `yarn build` regenerated `src/version.ts`
  (`export const version = '7.8.0';`). [session]
- [x] **CHANGELOG heading:** `## [Unreleased]` → `## [7.8.0]`, in place. At the v7.7.0, v7.7.1 and v7.7.2 tags
  the file's first heading was the release itself with no empty `[Unreleased]` above it, undated and without a
  link footer, and 7.8.0 follows that convention. [session]
- [x] **The guide's example lines** in `docs/performance-and-diagnostics.md`: the bootstrap notice reads
  `7.8.0`, and the `cucumber-tsflow loaded in 431ms.` example lost a space that `formatDuration()` never prints
  (the console run above showed `846ms`). Neither the skill, Architecture.md nor CONTRIBUTE.md quotes a version.
  [session]
- [x] **`yarn build` from the repo root** on the bumped tree: clean `lib/`, `src/version.ts` regenerated, the
  `.mjs` loaders copied, the package's `README.md`, `CHANGELOG.md` and `LICENSE` produced from the root files
  and byte-identical to them (`cmp` on all three), no stray `.js` under `src/`. Found here: the committed
  `cucumber-tsflow/CHANGELOG.md` copy was one entry behind the root (the 12e follow-up `cbd9b45` edited the root
  CHANGELOG without rebuilding), so the copy that ships is the one this build produced and this stage commits.
  A check that the copies match after the build goes on the Phase 13 standing-check list. [session]
- [x] **The cadence on the bumped tree**, 2026-09-24, Windows, Node v24.16.0: `yarn typecheck` clean, `yarn lint`
  clean, `yarn test:unit` 262 of 262, `yarn test:all` green on all sixteen variants (424 scenarios: 18, 26, 27, 30,
  31 or 32 per variant, every one passed). Re-run after the skill re-read's two source-visible corrections below:
  build, type-check, lint and unit tests clean again. [session]
- [x] **`yarn smoke:tarball` on the bumped tree**, green on 2026-09-24: `yarn pack` from the 7.8.0 manifest
  (241 entries, 227 under `lib/`), all 26 tarball checks passing (`package.json`, `README.md`, `CHANGELOG.md`,
  `LICENSE`, `bin/`, `api/`, `bindings/index.d.ts`, the ESM loaders, the spinner worker, the skill's five files,
  nothing development-only, no stale file under `lib/`); the only `esbuild-transpiler` file is the kept CommonJS
  plugin `lib/transpilers/esbuild-transpiler.js`, and nothing of that name is under `lib/transpilers/esm/`. In
  the fresh CommonJS project (229 packages from the registry) and the fresh ESM project the skill and the
  `bindings` stub installed, `cucumber-tsflow -p default` passed, and the step and context files type-checked
  (`moduleResolution` node and bundler). The script names the tarball `cucumber-tsflow.tgz`; the version inside
  is the manifest's 7.8.0. [session]
- [x] **The shipped agent skill re-read once more against the tree that is tagged** (2026-09-24; a read-only
  agent checked about a hundred claims in the five files against `src/` and the bin, and every finding was
  verified against the source here before anything changed). About 95 claims confirmed: the decorator
  signatures and their four arguments, the hook decorators, `{boolean}`, the tag fallback, the `bindings`
  exports, positional context injection, the CLI flags and their defaults, the eight transpiler names, the cache
  paths, every `TSFLOW_*` variable, the exit codes, the quoted error messages. Four claims contradicted the
  source and were corrected in the skill:
  - **Where the decorator mode comes from.** The skill said the esbuild transpilers read it from the profile and
    ts-node reads `tsconfig.json`. In the source every transpiler except `ts-vue-esm` compiles with the profile's
    value (`tsnode`/`tsnode-exp` and `tsvue`/`tsvue-exp` are chosen by it and pass it as a compiler option;
    `ts-node-esm`, esbuild and the Vue SFC compiler read it through `decorator-mode.ts`); only `ts-vue-esm` hands
    `.ts` files to `ts-node-maintained/esm`, which reads `tsconfig.json`. Three passages rewritten (SKILL.md's
    rule and its "Common mistakes" entry, `configuration.md`'s legacy-decorators section).
  - **Where selective loading and in-place watch reruns are off.** The skill named `ts-node-esm`, `ts-vue-esm`
    and third-party loaders; the gate is `loaderHooksMode() === 'async'`, which also holds under
    `TSFLOW_ESM_HOOKS=async` and on Node without `module.registerHooks` (before 22.15), so `es-*-esm` loses both
    there too. Three passages corrected (`configuration.md`, `running-and-debugging.md` twice).
  - **Which CucumberJS registrations abort the run.** The `Unable to find StepBinding!` check is only in
    `runStep` and in the test-case `Before`/`After` hook path of `test-case-runner.ts`; the skill said any step or
    hook registered with CucumberJS's functions. Narrowed to `Given`/`When`/`Then` and `Before`/`After`, with the
    exit code scoped to serial mode (SKILL.md, `migrating-from-cucumber.md`).
  - **When a context's `initialize()` runs.** `initializeContext` is called only from `runStep` and the
    `@before`/`@after` path; `@beforeStep`/`@afterStep` activate the binding class lazily in `hookFunction`
    without it. The skill said "before the first hook or step that uses it". Corrected in SKILL.md and twice in
    `bindings-and-context.md`, with the consequence stated (a context used first by a step hook is not yet
    initialized).

  Imprecise claims tightened: exit code `2` now also names ambiguous steps (an AMBIGUOUS status is not a FAILED
  one, so `hasFailures()` is false); the package-manager exit-code claim, which the repository cannot confirm,
  softened; `export =` dropped from the export forms (nothing in the source or the specs exercises it);
  "arrow-function properties are never registered" reworded to "not supported" (the decorators have no check on
  what they decorate); `dispose()` runs on binding class instances as well as contexts; the watch fallback notice
  is the line under the `Watch mode:` banner, and every run there is a child process. Two stale strings found
  outside the skill were fixed as well: the `--transpiler` help text claimed `Default: ESNODE` where there is no
  default (without the option no built-in transpiler is registered; CHANGELOG entry extended), and Architecture.md
  said the esbuild transpiler reads `global.experimentalDecorators` where it reads the mode through
  `decorator-mode.ts` and the `CUCUMBER_EXPERIMENTAL_DECORATORS` variable. Nothing on the branch changes after
  this box except documents. [session]

### D. Branch, hand-off and pull request

- [ ] **Squash and push per the 12c workflow:** the stage's working commits become one commit (`12f: release
  7.8.0`) on top of `81b7de0`, then this document's commit; nothing already pushed is rewritten; push. [session]
- [ ] **CI green on the pushed head:** pull request #68 runs the five-job matrix on the push; all five jobs
  succeed (checked through the GitHub API, since `gh` is not installed here). This is the "final `test:all` on
  the matrix" of the stage definition, on the tree that will be tagged. [session]
- [ ] **This document closed as the hand-off** (boxes ticked with evidence, the notes for Phase 13), the map's
  "Where the work stands" and document-map row updated, the plan's 12f status line written. [session]
- [ ] **Pull request #68 description written and the draft flag removed.** The description is what Lonnie reads
  first: what the release is (a performance release, 7.8.0, minor, nothing published removed), where to read
  (the aggregate diff, the CHANGELOG's 7.8.0 section, Architecture.md, `docs/performance-and-diagnostics.md`,
  the research map and its Phase 12 hand-offs), the UIS closing measurement, the skill maintenance rule (a
  consumer-visible change updates `skills/cucumber-tsflow/` in the same commit; every review checks it against
  the diff; it stays one skill with references), and the release steps in section E. The session drafts it;
  the owner posts it and requests Lonnie's review. [session drafts, owner posts]
- [ ] **The UIS testbed's skills-npm changes decided:** keep the
  `.claude/skills/npm-lynxwall-cucumber-tsflow-cucumber-tsflow` symlink and the `**/skills/npm-*` `.gitignore`
  line (what a consumer that runs skills-npm ends up with; the symlink stays live once the registry 7.8.0 is
  installed, since the package carries `skills/`), or revert both (delete the symlink, revert the one
  `.gitignore` line). Either way the `link:` dependency and `pnpm-lock.yaml` are restored to the registry
  version before anything in uis-tools is committed, as [local-consumer-testing.md](../local-consumer-testing.md)
  says. [owner]

### E. After the merge

- [ ] **Merge pull request #68 into `master`.** A squash-merge is acceptable: the branch history is one commit
  per stage or group, and the review reads the aggregate diff and the documents, not the commit list. CI runs
  again on the `master` push. [maintainer]
- [ ] **Annotated tag `v7.8.0` on the merge commit, pushed**, as v7.7.2 was on `a9f7946`. `publish.yml` runs on
  it: install, `yarn build`, `yarn test:all`, `npm publish --provenance --access public ./cucumber-tsflow/`.
  The `NPM_TOKEN` secret and the workflow's `id-token: write` permission are the repository's; nothing on the
  branch changes them. [maintainer]
- [ ] **Registry check:** `npm view @lynxwall/cucumber-tsflow version dist-tags dist.attestations` shows 7.8.0 as
  `latest` with a provenance attestation, and the published tarball contains `skills/`, `CHANGELOG.md` and
  `LICENSE`, which no earlier version carried. [owner or maintainer]
- [ ] **The UIS testbed moves from `link:` to `7.8.0`** and a `skills-npm` run there links the skill from the
  registry package; the first real consumer measurement of the published build is taken with the recipe in
  [local-consumer-testing.md](../local-consumer-testing.md). [owner]
- [ ] **Phase 13 starts** from the tagged tree, with the `release.yml` item above added to its dependency-health
  list. [session, next]

**Gate:** no open box. Boxes in E are ticked when the owner reports them; the stage is complete on this branch
when A to D are closed, and the phase is complete when E is.

## Pull request #68 description (draft for the owner to post)

Written for Lonnie, who reviews the pull request to `master` with an agent and then tags and publishes. The
owner posts it as the description of pull request #68 and takes the pull request out of draft.

---

**7.8.0: a performance release. Startup on a large suite is the target; nothing about writing step definitions
changes, and every published option, flag and export still works.**

This branch is the performance-enhancement work planned in `research/performance-enhancement-execution-strategy.md`:
eleven increments (Phases 1 to 11), then a whole-product review with a test build-out (Phase 12), each with its
own hand-off document under `research/execution-strategy/`. It is a **minor release**: `parallelLoad` /
`--parallel-load` is deprecated (accepted, ignored, with a notice naming where to remove it), and the only path
gone from the `exports` map is the internal `lib/transpilers/esm/esbuild-transpiler` ts-node plugin whose one
caller was removed with it. The version is already bumped to 7.8.0 in `cucumber-tsflow/package.json`, the
CHANGELOG heading is `## [7.8.0]`, and the package's README, CHANGELOG and LICENSE copies are the current build's.

**Measured effect**, on UIS Tools (a 1,600-scenario Vue suite, `es-vue-esm`, experimental decorators, serial):
the `dim` profile (334 scenarios, 200 support files) loads its support code in about 2.5 s warm, where 7.7.2
spent about 24 s, some 20 s of it in `source-map-support`'s synchronous `XMLHttpRequest` per file under jsdom; the
full suite loads its support code in 4 to 7 s warm; a `--watch` rerun of `dim` starts in about 0.4 s. The test
runtime itself is untouched (cucumber-tsflow is 0.4% of `runtime:run`; the rest is CucumberJS, jsdom and the
suite's own steps). The numbers and their discard rules are in `stage-12c-hand-off.md` under "What group 6
measured".

**What changed** (the `## [7.8.0]` CHANGELOG section is the full list):

- The esbuild ESM loaders run in-thread (`module.registerHooks()`, Node 22.15+) and call esbuild directly, with
  a fallback to `module.register()` on older Node.
- An on-disk transpile cache for the esbuild transpilers and the Vue SFC compiler, on by default
  (`transpileCache`), keyed on source, path, options and tool versions.
- Callsite capture is lazy, and callsite resolution no longer triggers the jsdom XHR path.
- Features are parsed and filtered before the support code loads; parallel workers receive the resolved
  support-file lists; the CLI enables Node's compile cache.
- New: selective loading (`selectiveLoad`, off by default), watch mode (`--watch`), startup progress lines with
  `TSFLOW_THEME`, a startup timing report (`TSFLOW_TIMING=true`), the `@lynxwall/cucumber-tsflow/bindings`
  entry point, and an agent skill shipped in `skills/`.
- Fixed: a throwing `BeforeAll`/`AfterAll` fails the run; steps always receive the running scenario's context;
  step locations under the ESM loaders map to the TypeScript line; every imported package is declared;
  `es-node-esm` starts without `vue`; the package ships CHANGELOG and LICENSE for the first time.
- Housekeeping: `strict: true`, `yarn typecheck` and `yarn lint` gates, American English spelling, dependency
  audit clean.

**How to review.** The aggregate diff is the thing to read, not the commit list (one squashed commit per stage
or group). Beside it: the CHANGELOG's 7.8.0 section; `Architecture.md`, which describes the product as it now
ships (execution flow, `BindingRegistry`, the transpiler matrix, the cache rule); `docs/performance-and-diagnostics.md`,
the user guide for every performance feature, cache and environment variable; and the research map, whose
"Document map" table says which hand-off answers which question. `CONTRIBUTE.md` and `CLAUDE.md` match the scripts.

**Verification.** CI runs the five-job matrix (Ubuntu and Windows, Node 22 and 24, plus Ubuntu with
`TSFLOW_ESM_HOOKS=async`) on every push to this pull request and is green on the current head. Locally on the
tagged tree: `yarn build`, `yarn typecheck`, `yarn lint`, 262 unit tests (`node:test`), `yarn test:all` (sixteen
spec variants), and `yarn smoke:tarball`, which packs the package, installs the tarball into fresh CommonJS and ESM
projects, runs a feature in each and type-checks the consumer's step files. The startup output was verified on a
real console (screen buffer read back at 120, 80, 40 and 24 columns).

**The shipped agent skill.** `cucumber-tsflow/skills/cucumber-tsflow/` (a `SKILL.md` and four references) is
published with the package in the skills-npm convention, so a consumer's `skills-npm` run links it into each
coding agent's skill folder. Maintenance rule, also in CLAUDE.md, CONTRIBUTE.md and the Copilot instructions: a
change a consumer can see updates the skill in the same commit, every review checks it against the diff, and it
stays one skill with references (skills-npm 1.2.0 keeps only the first skill of a package in `--recursive` mode).

**Release steps**, the same as 7.7.2: merge (a squash-merge is fine), then an annotated `v7.8.0` tag on the
merge commit, pushed. `publish.yml` runs on the tag: install, `yarn build`, `yarn test:all`,
`npm publish --provenance --access public ./cucumber-tsflow/`. `release.yml` was not used for 7.7.x and still runs
`actions/checkout@v2`; it is left alone here and listed for the follow-up.

**Follow-up (Phase 13, planned):** build time and package size (the tarball also carries
`src/transpilers/esm/README.md` and `lib/tsconfig.node.tsbuildinfo`, both harmless), the ESLint 10 migration, the
`release.yml` actions, and the dependency-health checks as a CI script.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

---

## Notes specific to Phase 13 and the owner

Written when the stage closes.
