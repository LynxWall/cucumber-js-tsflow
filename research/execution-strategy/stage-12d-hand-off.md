# Stage 12d hand-off

Part of the [Performance Enhancement Execution Strategy](../performance-enhancement-execution-strategy.md).

Written at the close of the stage (2026-09-24). Stage 12d is [Housekeeping sweeps](phase-12-plan.md#12d-housekeeping-sweeps):
the strict errors and `strict: true`, the `typecheck` and `lint` gates (findings Q and R), the American English
spelling pass, the dependency audit, and the leftovers the 12c groups set aside for this stage. **The stage is
complete and its gate is met.**

## State of the tree

- Branch `2026-09-speed-enhancements`. 12d is one commit, `0dcbff3`, squashed from four working commits
  (strict and the gates; the 12c leftovers; the spelling pass; the dependency audit) on top of `1d33fa7`, the 12c
  group 6 documentation commit. The tree of the squashed commit is byte-identical to the last working commit.
  This documentation commit follows it.
- The cadence held after each working commit: `yarn build` with no stray `.js` under `src/`, `yarn typecheck`
  clean, `yarn lint` clean, `yarn test:unit` green at **261 tests**, and one spec variant: `yarn
  test:node:cjs-esbuild` (31 of 31) after each, `yarn test:node:exp-esbuild` (31 of 31) as well after the
  leftovers because the decorator-mode variable changed, and `yarn test:vue:cjs-esbuild` (18 of 18) as well after
  the audit because the Vue and jsdom dependencies were in question.
- Boundary matrix on the final tree: `yarn test:all` green on all sixteen variants, counts 18, 18, 31, 31, 18, 18,
  25, 25, 30, 30, 30, 30, 31, 31, 27, 27, unchanged from the 12c close.
- Fifty files changed: `.github/workflows/ci.yml`, `eslint.config.mjs`, the root `package.json` and
  `yarn.lock`; under `cucumber-tsflow/`, `package.json`, `tsconfig.json`, `bin/cucumber-tsflow.js`, `README.md`
  and, under `src/`, `api/convert-configuration.ts`, `api/load-configuration.ts`, `bindings/binding-context.ts`,
  `bindings/binding-registry.ts`, `cli/index.ts`, `cli/run.ts`, `runtime/message-collector.ts`,
  `runtime/parallel/adapter.ts`, `runtime/parallel/run-worker.ts`, `runtime/test-case-runner.ts`,
  `transpilers/esbuild.ts`, `transpilers/esm/README.md`, `transpilers/transpile-cache.ts`,
  `utils/decorator-mode.ts`, `utils/startup-progress.ts`, `version.ts`; the two contributor skills under
  `.claude/skills/`; and, for spelling only, `Architecture.md`, `CHANGELOG.md`, `CLAUDE.md`, `README.md` and
  twenty documents under `research/`. No test file changed: every existing test passed as written.
- The shipped agent skill (`cucumber-tsflow/skills/cucumber-tsflow/`) was checked against the stage's diff and
  is unchanged: nothing it quotes (options, flags, environment variables, cache paths, error messages) changed
  in 12d; the removed identifiers and dependencies are internal.

## What landed

### Strict mode

The build configuration (`cucumber-tsflow/tsconfig.json`, extended by `tsconfig.node.json`) now sets
`strict: true` in place of `noImplicitAny` and `noImplicitThis`, which it implies; `noImplicitReturns`, not part
of `strict`, stays. `--strict` and `--strictNullChecks` reported the same 21 errors before the fixes, so the
switch adds nothing beyond them. The unit-test program (`test/tsconfig.json`) was already strict. The fixes, none
of which changes behavior:

- `bindings/binding-context.ts`: the experimental-decorator `stepBindings` array starts as `undefined`, not
  `null`; both branches of the code already tested it for truthiness.
- `runtime/message-collector.ts` (12 errors): CucumberJS's `doesHaveValue()` is not a type guard, so the eight
  `parseEnvelope` branches narrow on the envelope property directly. A Gherkin document's `uri` is optional in the
  messages schema; the map is keyed by it, so a document without one is not stored (every document CucumberJS
  parses from a file has one). The `doesHaveValue` import is gone; `doesNotHaveValue` is still used.
- `runtime/test-case-runner.ts` (5 errors): `StepRunner.run()`'s `IRunOptions` declares both `step` and
  `hookParameter` required although a step definition reads only the step and a hook definition only the hook
  parameter; CucumberJS's own runner passes `null` and `undefined` respectively. `invokeStep` now takes
  `step: PickleStep | null`, documents this, and casts once at the one call, instead of every caller lying.
  `currentTestStepId` is cleared to `undefined` (its declared type) rather than `null`; the caller tests it with
  `doesNotHaveValue`, which accepts both. The `testCaseStarted` envelope is built from a typed
  `messages.TestCaseStarted` object so `workerId` is set on a value the compiler knows exists.
- `api/convert-configuration.ts` (3 errors): the split formats are typed as `[string, string?]` tuples (what
  `IConfiguration.format` holds; `splitFormatDescriptor()` returns `string[]` and is cast to the tuple), and the
  file-format map is built by a loop with a guard instead of a `filter` / `reduce` pair whose narrowing the
  compiler cannot see. `IPublishConfig` declares `url` and `token` required while the environment gives `string |
  undefined`; CucumberJS's publish plugin substitutes its default URL for an undefined `url` and sends no
  `Authorization` header for an undefined `token`, so both are passed as they were, with a cast and the reason.

No non-null assertion was added. The casts are the two in `invokeStep`, the two on the publish fields and the two
on the format tuples, each with a comment.

### The gates (findings Q and R)

- `yarn typecheck` (root, delegating to the library workspace) runs `tsc --noEmit` over `tsconfig.node.json` and
  `test/tsconfig.json`. The test half was already in the 12c cadence by hand; the script makes it one command.
- The root `lint` script is now `eslint cucumber-tsflow/src cucumber-tsflow/test cucumber-tsflow/bin` with no
  `--fix`, so it fails on a finding; `lint:fix` is the old behavior. The `--ext` flag is gone: with a flat
  configuration ESLint lints `.js`/`.mjs`/`.cjs` by default and the TypeScript and Vue configurations add their own
  `files` patterns, and the result was identical with and without it. The 12c plan's description of `lint` as
  running the test matrix was already stale; the script ran ESLint with `--fix`, which is what changed.
- Finding R: a configuration block turns `no-undef` off for `*.ts`, `*.mts`, `*.cts` and `*.vue`, because the rule
  cannot see TypeScript's ambient and Node global types (`NodeJS.ProcessEnv`, `BufferEncoding`) and the compiler
  owns that check, as typescript-eslint advises. The `/* eslint-disable no-undef */` at the top of `cli/index.ts`
  is removed. `transpilers/esm/vue-jsdom-setup.mjs` keeps its disable: it is JavaScript and reads `window`, a
  global that exists only after jsdom is installed. The eight disables that remain under `src` and `bin` are all
  pre-existing (`no-var` on the five globals in `types/global.d.ts`, `no-empty-object-type` in
  `gherkin/models.ts`, `no-control-regex` in `startup-progress.ts`, and the jsdom one); none was added.
- `cucumber-tsflow/test/fixtures/**` is in ESLint's global ignores. Those are CommonJS support files written with
  ES import syntax for the library's own transpiler to handle; they are excluded from `test/tsconfig.json` for the
  same reason, so the TypeScript parser had no project for them and reported a parsing error.
- `genversion` runs with `--semi`, so the generated `src/version.ts` ends its one statement with a semicolon;
  that missing semicolon was the only thing `yarn lint` found in the whole tree. The regenerated file is
  committed.
- CI (`.github/workflows/ci.yml`) runs `yarn typecheck` and `yarn lint` after `yarn build` and before the unit
  tests, on every job of the matrix. The typecheck needs the build because the unit tests import the built
  `lib/*.js` and its declarations.

### The 12c leftovers

- `api/load-configuration.ts` (nine sites) and `api/convert-configuration.ts` (two) logged each failure with
  `logger.error` before rethrowing it wrapped, so a configuration error printed `[tsflow:config]:ERROR …` and
  then the CLI's `[tsflow:run]` report. Like the transpilers and ESM loaders after finding AB, they now keep the
  copy as a `logger.checkpoint` with `describeThrowable(error)` in its detail, which prints only under
  `TSFLOW_VERBOSE` (`checkpoint` is gated inside the logger, so no `if (verbose)` is needed in TypeScript).
- `BindingRegistry.removeBindingsForFile()` and `hasBindingForKey()` are deleted. They were written for the
  delta-aware reload that 12c's finding D replaced, were called nowhere in `src` or `test`, and were reachable
  only through the `./lib/*` wildcard export that this branch treats as internal. The README's performance list
  no longer names `hasBindingForKey()`; the 7.7.0 CHANGELOG entry that introduced it is history and stands.
- `TranspileOptions.debug` in `transpilers/esbuild.ts` was declared and defaulted to `true` but read nowhere. The
  type keeps only `esbuild?`, and the defaults object that existed to hold `debug` is gone.
- The parallel adapter used to hand its children the decorator mode as a second environment variable,
  `EXPERIMENTAL_DECORATORS`, which `run-worker.ts` turned back into a boolean for the worker's
  `setExperimentalDecorators()`, while the children also inherited `CUCUMBER_EXPERIMENTAL_DECORATORS`. Now
  `decorator-mode.ts` exports the variable name (`EXPERIMENTAL_DECORATORS_VARIABLE`), the adapter sets that one
  variable in the child environment (explicitly, because the run environment's `env` need not be `process.env`),
  and `run-worker.ts` reads it through `experimentalDecorators()`. Architecture.md's description of the mode
  (one value, recorded by `setExperimentalDecorators()`, read from the environment) was already what the code now
  does.

### The spelling pass

- A Node script applied 169 replacements in 32 files, on the file text as a whole so line endings were untouched
  (`git diff --numstat` shows only the affected lines). The forms: color, behavior, serialize, recognize,
  normalize, initialize, summarize, gray, favor, honor, defense, artifact, analyzed, judgment, neighbor, with
  their capitalized, upper-case and inflected forms (plurals, past tenses, "-al" and "-less" derivatives). Three
  stems that look British were checked and left alone: "specialist", "optimistic" and "analysis"/"analyses".
- Identifiers renamed to their American spellings: `wheelColor` and `FRAMES_PER_COLOR` in
  `utils/startup-progress.ts` (module-private, not exported); `keepColors` and the environment variable
  `TSFLOW_TRACE_COLORS` in the contributor console skill's `trace-writes.js`, with its `SKILL.md` updated in the
  same pass. Grep of `test/`, `skills/` and the spec workspaces found no consumer of any of them under the old
  names. Nothing on the CucumberJS boundary changed (`colorFns` was already American).
- Every distinct old-to-new word pair in the diff was read (`git diff --word-diff`), and two sentences that
  described the inventory by quoting the British words (the Strand 3 bullet in `phase-12-plan.md`, a leftover
  note in the 12c hand-off) were reworded so they do not now quote American words as British ones. One heading
  changed (`### \`transformSync\` serializes all transpilation` in `research/analysis-3.md`); nothing links to
  it.
- Files covered: `*.md`, `*.ts`, `*.mjs`, `*.js`, `*.feature`, `*.json` and `*.yml` under version control, minus
  `cucumber-tsflow/lib`. A final `git grep` over the same set with a wider word list (the British forms of while,
  center, license, organize, customize, catalog, program, and some twenty more) finds nothing. The real-console
  check of the spinner after the
  color renames stays in 12f as the plan has it; the renames are identifier-only and `startup-progress.test.ts`
  is green.

## The dependency audit

Every dependency of `cucumber-tsflow/package.json` was checked for an import under `src` or `bin`; those on the
stage's list are decided as follows, and the lockfile was refreshed with `yarn install` (18 lines removed, the
`import-sync` entry and its dependency; `tslib` stays in the lockfile for the four Vue spec workspaces that
declare it themselves).

| Package | Decision | Reason |
| --- | --- | --- |
| `import-sync` | removed | Imported nowhere in `src` or `bin`. |
| `tslib` | removed | Imported nowhere; TypeScript emits calls into it only with `importHelpers`, which the build does not set. |
| `@types/node` | kept as a dependency | `ts-node-maintained` declares it a peer dependency (`*`), and the published declarations reference `NodeJS.ProcessEnv`, so a consumer type-checks against `lib/*.d.ts` without adding it. |
| `typescript` | kept | No direct import, but `ts-node-maintained` declares it a peer (`>=2.7`) and the `ts-node`, `ts-vue`, `ts-node-esm` and `ts-vue-esm` transpilers compile with it. |
| `jsdom` | kept | Reached only through `jsdom-global`, which the three Vue transpilers and `vue-jsdom-setup.mjs` import and which declares `jsdom >=10.0.0` as its peer dependency. |

**Found by the same check and left for the owner: five packages are imported but not declared.** They resolve
today because Yarn hoists them into the root `node_modules` of this monorepo, and in a pnpm consumer because pnpm
hoists transitive packages into `node_modules/.pnpm/node_modules`, where every package can see them. Declaring
them is adding dependencies, which is the owner's call, so nothing was changed:

| Package | Imported by | Arrives today through | Suggested |
| --- | --- | --- | --- |
| `@cucumber/messages` | 17 files (the runtime, the formatters, `api/`, `bindings.ts`) | `@cucumber/cucumber` 12.7.0 pins `32.0.1` | declare at `32.0.1` |
| `@cucumber/gherkin` | `cli/argv-parser.ts`, `gherkin/gherkin-feature.ts` | `@cucumber/cucumber` pins `38.0.0` | declare at `38.0.0` |
| `@cucumber/cucumber-expressions` | `api/selective-load.ts` | `@cucumber/cucumber` pins `19.0.0` | declare at `19.0.0` |
| `xmlbuilder` | `formatter/junit-bamboo-formatter.ts` | `@cucumber/junit-xml-formatter` 0.9.0 (a dependency of `@cucumber/cucumber`) wants `^15.1.1` | declare at `~15.1.1` |
| `vue` (`vue/compiler-sfc`, and a type import in `types/vue-shim.d.ts`) | `transpilers/vue-sfc-compiler.ts` | the Vue spec workspaces (3.5.13); a consumer's own `vue` | an optional peer dependency (`>=3`), since only the Vue transpilers need it and every Vue consumer has it |

**`yarn npm audit --all --recursive`: 19 advisories, all in transitive packages; none is fixed here.** Grouped
by how they reach the tree:

| Package (installed) | Severity | Fixed in | Path |
| --- | --- | --- | --- |
| `brace-expansion` 5.0.5 | high | >=5.0.9 | `glob`, `@cucumber/cucumber` (library); also `@vue/test-utils`, `eslint` |
| `diff` 4.0.2 | low | >=4.0.4 | `ts-node-maintained`, `@cucumber/cucumber` (library) |
| `form-data` 4.0.4 | high | >=4.0.6 | `jsdom`, `jsdom-global` (library) |
| `semver` 7.3.5 | high | >=7.5.2 | `@cucumber/cucumber` (library); also `eslint` |
| `uuid` 9.0.1 | moderate | >=11.1.1 | `short-uuid` (library) |
| `ws` 8.18.3 | high | >=8.21.0 | `jsdom`, `jsdom-global` (library) |
| `yaml` 2.2.2 | moderate | >=2.8.3 | `@cucumber/cucumber` (library) |
| `picomatch` 2.3.1 | high | >=2.3.2 | `shx` (library dev), `@vue/eslint-config-typescript` |
| `tar` 6.2.0 | high | >=7.5.21 | `@jsdevtools/npm-publish` (root dev) |
| `@eslint/plugin-kit` 0.2.7, `@humanfs/node` 0.16.6, `ajv` 6.12.6, `flatted` 3.3.3, `js-yaml` 4.1.0, `postcss-selector-parser` 6.1.2 | low to high | see the audit | `eslint`, `@eslint/eslintrc`, `eslint-plugin-vue`, `@vue/eslint-config-typescript` (root dev) |
| `nanoid` 3.3.9, `postcss` 8.5.3 | high | >=3.3.12, >=8.5.18 | `vue` (spec workspaces) |
| `js-cookie` 3.0.5 | high | >=3.0.7 | `@vue/test-utils` (spec workspaces) |
| `validator` 13.15.0 | high | >=13.15.22 | `class-validator` (the `node-exp` and `node-exp-esm` spec workspaces) |

What would clear them, for the owner to accept or decline: `short-uuid` 6.0.3 no longer depends on `uuid` at
all (a major bump of a library dependency; its `generate()` and translator API should be checked before
upgrading); the rest are resolvable inside their declared ranges, so a `yarn up -R <package>` per row would
move only the lockfile, but it changes what the matrix installs and was not run unasked. Nothing in the list is
reachable from the library's published code path except through `@cucumber/cucumber`, `jsdom`, `glob`,
`ts-node-maintained` and `short-uuid`, and a consumer resolves those trees for itself.

## Notes specific to 12e and the owner

- **Stage 12d is closed and its gate is met:** `yarn typecheck` and `yarn lint` clean with no new disables (one
  removed), zero British spellings in `src` and the documents, every dependency on the list decided. 12e,
  documentation and packaging, is next; its definition and gate are in
  [phase-12-plan.md](phase-12-plan.md#12e-documentation-and-packaging).
- **For 12e, from this stage:** `CLAUDE.md`'s command table gained `yarn typecheck`, `yarn lint` (as a gate) and
  `yarn lint:fix`, and its CI line now describes the matrix and the two new steps; the rest of the CLAUDE.md and
  CONTRIBUTE.md review the plan gives 12e still stands (CONTRIBUTE.md lists `yarn test`, which does not exist, and
  knows nothing of `typecheck` or `lint:fix`). The `[Unreleased]` CHANGELOG has four `Changed` entries and two
  `Removed` entries for this stage; 12e reads them with the rest as one product. Carried over from 12c for 12e:
  both READMEs list **Parallel preload** as a feature, the root README's transpile-cache paragraph mentions
  `parallelLoad` preload threads, finding G's cache-participation rule goes into Architecture.md, and the shipped
  agent skill is re-read against the tree (unchanged by this stage, see above).
- **For the owner, decisions this stage surfaced and did not take:** the five undeclared packages and the audit
  table above; finding P from 12c (the compile cache, kept as shipped, may still be dropped); the 12c candidate
  of a short retry on `EPERM`/`EBUSY` in `SelectiveLoadSession.writeIndex()` and `transpile-cache.ts`'s
  `writeEntry` for the Windows unit-test flake seen twice in 12c (not seen in this stage's eight `yarn test:unit`
  runs); the 12c observation that `esm/esbuild.mjs` and `esm/loader-utils.mjs` each call `tsconfig-paths`'
  `loadConfig()` once per thread (not on the 12d list, not done).
- **Two pre-existing cosmetic items noted in 12c stand:** the formatter summary prints before the launch phase
  line closes in a parallel run where no test case ever starts, and three links in `ratings.md` point at the
  `parallelLoad` source files Phase 8 deleted (history).
- **Working notes for the next session** (the assistant's tooling on this machine): Node scripts need Windows
  paths (`C:/…`), not Git Bash's `/c/…`; a long heredoc whose body contained apostrophes failed to parse in the
  assistant's shell, so multi-line edit specifications were written with the file tool and applied by a small
  Node script that does exact single-occurrence replacement and preserves each file's line endings (CRLF in
  `src`, LF in most documents); a per-file `grep` loop over `git ls-files` takes minutes in Git Bash while
  `git grep -l` over the same set is instant; `grep`'s bracket expression cannot hold the multibyte box-drawing
  characters `yarn npm audit` prints, so match them as alternatives (`^(├─|└─) `); `require.resolve('<pkg>/package.json')`
  fails for `@cucumber/messages` and `@cucumber/cucumber-expressions` because their `exports` maps do not expose
  it, which is not a resolution problem.
- The commit workflow decided in 12c (small commits inside a stage, one squashed commit before the hand-off and
  before any push, no push of working commits) was followed: four working commits, squashed to `0dcbff3`
  on top of `1d33fa7` with a byte-identical tree, then this documentation commit, then the push. Nothing already
  pushed was rewritten.
