# Stage 12f hand-off

Part of the [Performance Enhancement Execution Strategy](../performance-enhancement-execution-strategy.md).

Opened at the start of the stage (2026-09-24). Stage 12f is [Release](../plan/phase-12-plan.md#12f-release): the release
checklist, written before anything else as the stage's definition says, the real-console verification of the
startup output, the version bump, the final matrix run, and the hand-over to the maintainer who tags and
publishes. **Every box the session owns is closed (2026-09-24); the stage is complete on this branch.** What
remains is the owner's (the version confirmation, the reading, posting the pull request description, the UIS
testbed decision) and the maintainer's (merge, tag, publish), listed in sections A, B, D and E. This document was
the checklist while the stage ran and is the hand-off now: each box carries the commit or the evidence that
closed it.

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
- The UIS testbed (`Tools.Web/VueApp` in the UIS Tools repository) still holds the two uncommitted changes skills-npm
  made in 12e (the `.claude/skills/npm-lynxwall-cucumber-tsflow-cucumber-tsflow` symlink and the `**/skills/npm-*`
  `.gitignore` line) beside the `link:` dependency and lockfile changes from
  [local-consumer-testing.md](../testing/local-consumer-testing.md), which are never committed.

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

Superseded on 2026-09-25: the [release review](#release-review-2026-09-25) made the release 8.0.0. The box below
is the decision as it was taken in the stage.

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

- [x] **Squash and push per the 12c workflow:** the stage is one commit, `9e99c0e` (`12f: release 7.8.0`), on top
  of `81b7de0`, followed by this document's commit `a55b5dd`; no working commit needed squashing, nothing already
  pushed was rewritten, and both are pushed (2026-09-24). [session]
- [x] **CI green on the pushed head:** pull request #68 ran the five-job matrix on `a55b5dd` (run 36039476476,
  2026-09-24 18:11 to 18:14 UTC): Ubuntu Node 22, Ubuntu Node 24, Ubuntu Node 24 with async ESM hooks, Windows
  Node 22 and Windows Node 24 all succeeded (checked through the GitHub API, since `gh` is not installed here).
  This is the "final `test:all` on the matrix" of the stage definition, on the tree that will be tagged; the
  documentation commit that closes this hand-off follows it and changes nothing under `cucumber-tsflow/`. [session]
- [x] **This document closed as the hand-off** (boxes ticked with evidence, the notes for Phase 13 and the owner
  below), the map's "Where the work stands" and document-map row updated, the plan's 12f status line written.
  [session]
- [ ] **Pull request #68 description written and the draft flag removed.** The description is what Lonnie reads
  first: what the release is (a performance release, 7.8.0, minor, nothing published removed), where to read
  (the aggregate diff, the CHANGELOG's 7.8.0 section, Architecture.md, `docs/performance-and-diagnostics.md`,
  the research map and its Phase 12 hand-offs), the UIS closing measurement, the skill maintenance rule (a
  consumer-visible change updates `skills/cucumber-tsflow/` in the same commit; every review checks it against
  the diff; it stays one skill with references), and the release steps in section E. The session drafts it;
  the owner posts it and requests Lonnie's review. [session drafts, owner posts]
- [x] **Dropped by the owner (2026-09-24: "don't worry about the UIS testbed").** The box as written stood: keep the
  `.claude/skills/npm-lynxwall-cucumber-tsflow-cucumber-tsflow` symlink and the `**/skills/npm-*` `.gitignore`
  line (what a consumer that runs skills-npm ends up with; the symlink stays live once the registry 7.8.0 is
  installed, since the package carries `skills/`), or revert both (delete the symlink, revert the one
  `.gitignore` line). Either way the `link:` dependency and `pnpm-lock.yaml` are restored to the registry
  version before anything in uis-tools is committed, as [local-consumer-testing.md](../testing/local-consumer-testing.md)
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
- [x] **Dropped by the owner (2026-09-24).** The UIS testbed's move from `link:` to `7.8.0`, the `skills-npm` run
  there and a consumer measurement of the published build are not part of this release; UIS Tools is pinned at
  `~7.5.5` in production and upgrades on its own schedule (see the version note below). [owner]
- [ ] **Phase 13 starts** from the tagged tree, with the `release.yml` item above added to its dependency-health
  list. [session, next]

**Gate:** no open box. Boxes in E are ticked when the owner reports them; the stage is complete on this branch
when A to D are closed, and the phase is complete when E is.

## Release review (2026-09-25)

After the stage closed, the owner asked for an outside-in review of the branch, read two ways: as the long-time
maintainer would read it (the overarching patterns, not the line-level code, which Phase 12 had covered) and as a
long-time user would receive the upgrade. It found no correctness problem. What it changed, decided with the owner:

- **The release is 8.0.0, a major version.** The branch already changes what a user can see: a throwing
  `BeforeAll` fails the run, step locations become relative on Linux and macOS, steps always get the running
  scenario's context, `loadSupport` and `reloadSupport` start from an empty registry, and one published export is
  gone. The owner sees the release as a change in how cucumber-tsflow is used. The minor-release rule of 12c
  group 2 is replaced: breaking changes are allowed, each is listed in the upgrade notes, and the simpler
  implementation wins over a compatibility shim. `parallelLoad` stays accepted and ignored, so a leftover setting
  prints its notice instead of failing. Lonnie confirms the number.
- **Node's compile cache is removed** (finding P, which the 12c closing measurement found neutral):
  `bin/cucumber-tsflow.js` no longer calls `module.enableCompileCache()` or exports `NODE_COMPILE_CACHE`, and the
  guide, the skill, Architecture.md and `yarn bench --cold` follow. No published version carried it.
- **cucumber-tsflow's own output goes to stderr**, and stdout carries only formatter output: the bootstrap pair,
  `Loading configuration`, the mode banner, the startup progress (its spinner worker draws on fd 2), the
  `parallelLoad` notice and watch mode's lines. The specs and unit tests that read those lines read stderr, and
  the step `the standard output holds no escape sequences` became `the output holds no escape sequences`, checking
  both streams.
- **The extensionless `bin/cucumber-tsflow` is deleted.** It was a copy of `bin/cucumber-tsflow.js` that the
  `bin` field never named; it shipped in the tarball and had drifted (the 12d spelling pass missed it).
- **The CHANGELOG is rewritten for users.** The 8.0.0 entry opens with "Breaking changes", then gives one line per
  feature, about 7 KB against 35 KB, and links to the guide and to [detailed-changes.md](../detailed-changes.md),
  where the engineering-level list now lives with the two changes above folded in.
- **The research folder is reorganized** into `research/speed-enhancements/` with `analysis/`, `plan/`,
  `hand-offs/`, `testing/`, `scripts/` and `measurements/`, a project README, [decisions.md](../decisions.md) and
  an index at `research/README.md`. Machine-specific paths are scrubbed; project names stay, since the main
  audience is the JHU UIS team.
- **The VS Code extension** has been broken for some time and is not a release gate. The upgrade notes tell its
  users to stay on 7.x, and the owner tracks updating it to the new loading model as a follow-up.
- **Kept after discussion:** the startup progress (in the owner's words, core developer experience, with the UIS
  suites growing fast), the LOTR theme, and the `./lib/*` wildcard export. The library resolves its own
  transpilers through `lib/*`, so closing it is a Phase 13 item for a later major.
- **The first full-suite comparison with the version the team runs**, UIS Tools `develop` on 7.5.5 against this
  build: [measurements/uis-tools-7.5.5-vs-8.0.0.md](../measurements/uis-tools-7.5.5-vs-8.0.0.md). On clean runs 7.5.5 took 15m 28s and 14m 59s, and this build 4m 35s on a warm transpile cache and 6m 12s on a cold one. The wait before the first scenario went from about 6 minutes to 15 to 24 s, and the test run from about 9½ minutes to 4½ to 6, since 7.5.5 spent about 2½ minutes of it on its own work between steps. A busy peer session disturbed about half of the fourteen runs, which are kept and marked; the four step timeouts in two of them were load, since the feature passes alone. The measurement also hit the undeclared-dependency bug 8.0 fixes: after a reinstall, 7.5.5 could not start under pnpm without the `@cucumber/messages` it imports but does not declare.

**Verification on the reviewed tree** (2026-09-25, Windows, Node 24.16.0): `yarn build`, `yarn typecheck` and
`yarn lint` clean; 262 of 262 unit tests; `yarn test:all` green on all sixteen variants (424 scenarios); `yarn
smoke:tarball` green in the fresh CommonJS and ESM projects. The startup output was verified on a real console with
the `verify-console-output` skill, which gained a `-StderrToConsole` switch for it (its runner had appended the
child's stderr to its log): the progress on stderr at 120, 80, 40 and 24 columns in the default theme and at 80 in
`lotr`, with formatter-style output on stdout after it, showed every phase on its natural rows, glyphs as single
cells, and stdout's output starting at column 0 beneath the last phase; a write trace showed the worker redrawing
every 140 ms on stderr through a 2 s main-thread block; and the real CLI (`-p esnode ../features/basic-test.feature`
in the `node` workspace) was right at 120 and 80 columns. `yarn bench` was rerun for the guide's reference table,
which also corrects the table's reading of the cold Vue run: its 29.5 s is the operating system reading files it
had not read for hours, not V8 compiling them, since runs 2 and 3 took 1.1 s with no compile cache at all.

Nothing is pushed; the review is one local commit on top of `2b84bc2`, for the owner to read before it goes to
pull request #68.

## Pull request #68 description (draft for the owner to post)

Written for Lonnie, who reviews the pull request to `master` with an agent and then tags and publishes. The
owner posts it as the description of pull request #68 and takes the pull request out of draft. Rewritten for
8.0.0 in the release review; it replaces the 7.8.0 draft that stood here.

---

**8.0.0: a major release for speed.** On UIS Tools the full suite runs in 4½ to 6 minutes against about 15 on 7.5.5, the version the team uses, and the wait before the first scenario is 15 to 25 seconds instead of about 6 minutes. Writing step definitions does not change.

This branch is the performance work planned in `research/speed-enhancements/performance-enhancement-execution-strategy.md`:
eleven increments (Phases 1 to 11), a whole-product review with a test build-out (Phase 12) and a release review,
each with its hand-off under `research/speed-enhancements/hand-offs/`. `research/speed-enhancements/decisions.md`
has the design decisions, with their evidence, in one place.

**Why 8.0.0.** It was planned as 7.8.0, but the fixes change what a user sees, and the release changes how the
tool is used, so we propose a major. The version is already 8.0.0 in all ten manifests, the CHANGELOG heading and
the README section; please confirm, or say if you would rather number it differently (the bump is one commit). The
breaking changes, all listed first in the CHANGELOG's 8.0.0 entry:

- a `BeforeAll` or `AfterAll` hook that throws fails the run, as in CucumberJS (it used to be swallowed under a
  passing summary);
- cucumber-tsflow's own output (configuration and mode lines, the new startup progress, notices) goes to stderr,
  so stdout carries only formatter output;
- step-definition locations are relative to the working directory on every platform;
- steps always receive the running scenario's context;
- `loadSupport()` and `reloadSupport()` start from an empty registry and evaluate every support file again on
  each call; the VS Code extension has not been updated for this, and its users are told to stay on 7.x;
- removed: the `lib/transpilers/esm/esbuild-transpiler` export, two internal `BindingRegistry` methods, the
  `undefined` runtime values of three interfaces in the ES module entry points, and the extensionless
  `bin/cucumber-tsflow`; `instanceof Cli` no longer matches, and `ts-node-esm` ignores `ts-node.files`.

`parallelLoad` / `--parallel-load`, your 7.7 preload, is accepted and ignored with a notice saying where to remove
it. Measured on UIS Tools' `dim` profile once the transpile cache existed, the preload cost 5 to 6 s on every run
and saved at most 1.8 s, cold only, because its threads had to evaluate each support module's graph to reach the
transpile step and the main thread then evaluated it all again. The transpile cache keeps what it was for.

**Measured effect**, UIS Tools `develop` (1,624 scenarios, 218 support files, `es-vue-esm`, serial), 7.5.5 from
the registry against this build, same machine, same afternoon:

| | 7.5.5 | 8.0.0, warm transpile cache | 8.0.0, cold transpile cache |
| --- | --- | --- | --- |
| Whole run, wall clock | 15m 28s, 14m 59s | 4m 35s | 6m 12s |
| Before the first scenario | 6m 02s, 5m 27s | 15 s | 24 s |
| Test run (Cucumber's figure) | 9m 26s, 9m 32s | 4m 20s | 5m 48s |

Most of the gain is startup: `source-map-support` issued a synchronous XMLHttpRequest per support file under
jsdom, and the ESM loaders routed every file through ts-node on a separate thread. The test run is shorter too:
7.5.5 spent 2m 26s of it outside the step bodies, in tsflow's per-step lookups, which now take seconds. The full
record, with the runs a busy machine disturbed, is in `research/speed-enhancements/measurements/uis-tools-7.5.5-vs-8.0.0.md`.

**What changed** (the CHANGELOG's 8.0.0 entry is the user-level list, `research/speed-enhancements/detailed-changes.md`
the engineering-level one):

- The esbuild ESM loaders run in-thread (`module.registerHooks()`, Node 22.15+) and call esbuild directly, with
  a fallback to `module.register()` on older Node.
- An on-disk transpile cache for the esbuild transpilers and the Vue SFC compiler, on by default
  (`transpileCache`), keyed on source, path, options and tool versions.
- Callsite capture is lazy, and callsite resolution no longer triggers the jsdom XHR path.
- Features are parsed and filtered before the support code loads; parallel workers receive the resolved
  support-file lists; runtime lookups are constant-time.
- New: selective loading (`selectiveLoad`, off by default), watch mode (`--watch`), startup progress lines with
  `TSFLOW_THEME`, a startup timing report (`TSFLOW_TIMING=true`), the `@lynxwall/cucumber-tsflow/bindings`
  entry point, and an agent skill shipped in `skills/`.
- Fixed: step locations under the ESM loaders map to the TypeScript line; every imported package is declared (the
  measurement hit this: after a reinstall, 7.5.5 could not start under pnpm because nothing hoisted the
  `@cucumber/messages` it imports without declaring); `es-node-esm` starts without `vue`; the package ships
  CHANGELOG and LICENSE for the first time.
- Housekeeping: `strict: true`, `yarn typecheck` and `yarn lint` gates, American English spelling, dependency
  audit clean.

**How to review.** The aggregate diff is the thing to read, not the commit list (one squashed commit per stage
or group). Beside it: the CHANGELOG's 8.0.0 entry; `Architecture.md`, which describes the product as it now ships
(execution flow, `BindingRegistry`, the transpiler matrix, the cache rule); `docs/performance-and-diagnostics.md`,
the user guide for every performance feature, cache and environment variable; and
`research/speed-enhancements/decisions.md`, then the map's "Document map" table for which hand-off answers which
question. `CONTRIBUTE.md` and `CLAUDE.md` match the scripts.

**Verification.** CI runs the five-job matrix (Ubuntu and Windows, Node 22 and 24, plus Ubuntu with
`TSFLOW_ESM_HOOKS=async`) on every push to this pull request. Locally on the tagged tree: `yarn build`,
`yarn typecheck`, `yarn lint`, the unit tests (`node:test`), `yarn test:all` (sixteen spec variants) and
`yarn smoke:tarball`, which packs the package, installs the tarball into fresh CommonJS and ESM projects, runs a
feature in each and type-checks the consumer's step files. The startup output was verified on a real console.

**The shipped agent skill.** `cucumber-tsflow/skills/cucumber-tsflow/` (a `SKILL.md` and four references) is
published with the package in the skills-npm convention, so a consumer's `skills-npm` run links it into each
coding agent's skill folder. Maintenance rule, also in CLAUDE.md, CONTRIBUTE.md and the Copilot instructions: a
change a consumer can see updates the skill in the same commit, every review checks it against the diff, and it
stays one skill with references (skills-npm 1.2.0 keeps only the first skill of a package in `--recursive` mode).

**Release steps**, the same as 7.7.2: merge (a squash-merge is fine), then an annotated `v8.0.0` tag on the
merge commit, pushed. `publish.yml` runs on the tag: install, `yarn build`, `yarn test:all`,
`npm publish --provenance --access public ./cucumber-tsflow/`. `release.yml` was not used for 7.7.x and still runs
`actions/checkout@v2`; it is left alone here and listed for the follow-up.

**Follow-up (Phase 13, planned):** build time and package size, the ESLint 10 migration, the `release.yml`
actions, the dependency-health checks as a CI script (including the four `@cucumber/*` pins agreeing with
CucumberJS's), updating the VS Code extension to the new loading model, and, for a later major, closing the
`./lib/*` wildcard export and removing `parallelLoad`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

---

## Notes specific to Phase 13 and the owner

- **The owner's reading of the hand-off (2026-09-24)** raised one question and took one decision. The question:
  UIS Tools runs `~7.5.5` in production, nothing of this work has reached production, so is 7.8 skipping 7.6 and
  7.7? Answer, from the registry: 7.6.0 (2026-03-27), 7.7.0 and 7.7.1 (2026-03-29) and 7.7.2 (2026-03-30) are all
  published, tagged by Lonnie; 7.6.0 was a duplicate-message fix and 7.7.x the parallel preload and worker shims,
  his March work rather than this branch's; UIS simply never upgraded past 7.5.5. The branch was cut from
  `master` at 7.7.2, so 7.8.0 is the next minor after the last published version and skips nothing. The same
  question is put to Lonnie in the pull request description above, so he confirms the number. When UIS does move
  off 7.5.5 it crosses 7.6 and 7.7 as well; nothing in them affects a project that never enabled `parallelLoad`.
  The decision: the UIS testbed is out of scope for this release (its two boxes above are marked dropped).
- **For the owner, in order:** read the guide, the README paragraph and its 7.8.0 section, and the skill (section
  A's open box); post the description above on pull request #68, take it out of draft and request Lonnie's review.
  Everything else in sections A to D is done.
- **For Lonnie**, section E: merge, annotated `v7.8.0` tag on the merge commit, `publish.yml` publishes. The
  version, the CHANGELOG heading and the package copies are already on the branch, so the tag is the only act.
- **Dependabot on `master`.** The push printed GitHub's notice that the default branch has 55 open Dependabot
  alerts (40 high, 14 moderate, 1 low). They are `master`'s lockfile, which 12d's audit work on this branch
  replaced (`yarn npm audit` reports nothing here). Most should close when pull request #68 merges; the ones that
  remain are Phase 13's first dependency-health item to look at, and the alert list is worth reading before the
  tag in case one names a runtime dependency the branch still carries.
- **Phase 13 items collected in this stage** (added to the map's Phase 13 paragraph): `release.yml` on
  `actions/checkout@v2` and `actions/setup-node@v3`; the package copies (`README.md`, `CHANGELOG.md`, `LICENSE`)
  checked against the root after `yarn build`, since a follow-up commit had left the CHANGELOG copy one entry
  behind; the tarball's `src/transpilers/esm/README.md` and `lib/tsconfig.node.tsbuildinfo` from 12e.
- **Two behaviors the skill re-read surfaced that are documented, not changed** (a minor release changes no
  behavior at this point; both are candidates for the owner's list after the release): a context used first by a
  `@beforeStep`/`@afterStep` hook is used before its `initialize()` runs, because only steps and `@before`/`@after`
  hooks trigger initialization; and a step hook or `BeforeAll`/`AfterAll` registered with CucumberJS's own
  functions is not caught by the `Unable to find StepBinding!` check that stops a plain `Given` or `Before`
  (what such a hook then does was not tested).
- **Working notes:** `gh` is not installed on this machine, so pull request and workflow state came from the
  public GitHub API with `curl` and a small Node filter; the console harness runs from Claude's PowerShell tool
  with `pwsh -File launch.ps1` and one window per width; the CRLF files (Architecture.md, `argv-parser.ts`) and
  the LF skill files were edited with a two-pass exact-replacement Node script that keeps each file's line
  endings, in the scratchpad, since the file tools had not read them.
