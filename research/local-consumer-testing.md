# Testing a Local Build Against UIS Tools

The spec matrix in this repository is 28 scenarios across 8 feature files. None of the costs identified in
the performance analyses are visible at that size, so every change on the
[execution strategy](performance-enhancement-execution-strategy.md) worklist needs a large real consumer
to be measured against. This document describes how the local build is wired into one.

## The consumer

`C:\Git\Azure\uis-tools\Tools.Web\VueApp` is a pnpm 11 workspace (`packageManager: pnpm@11.13.1`) with
three member packages: `e2e`, `test` and `tools`. The `test` package (`uis-tools-test`) is the relevant
one:

| Property | Value |
| --- | --- |
| Feature files / scenarios | 207 / ~1380 |
| Step-definition files | 208 under `test/steps/` |
| Transpiler | `es-vue-esm` with `experimentalDecorators: true` |
| Parallelism | none — no profile sets `parallel` or `parallelLoad` |
| Node | 24.16.0 (`engineStrict: true`) |
| Vue | 3.5.17 |

`@lynxwall/cucumber-tsflow` is declared once, as a `devDependency` of the **workspace root**
`package.json`, and both `test` and `e2e` reach the `cucumber-tsflow` bin through pnpm's root
`node_modules/.bin`. The registry version in use before this setup was `~7.5.5`; the local build is `7.7.2`.

Profiles live in `test/cucumber.json`. Sizes, for picking an inner-loop target:

| Profile | Features | Scenarios | Imports |
| --- | --- | --- | --- |
| `utils` | 3 | 49 | `test-setup.mjs`, `world-context.ts`, `steps/utils/**` |
| `alerts` | 2 | 11 | `test-setup.mjs`, `world-context.ts`, `steps/alerts/*` |
| `dim` | 32 | 314 | subset |
| `default` | 207 | ~1380 | `test-setup.mjs`, `steps/**/*.ts` |

Because no profile is parallel, the N+1 process-multiplier costs in the analyses do not apply to this
consumer. What does apply, at full scale, is every serial cost: item 2's whole-run `pickleMap` scan
(1380 pickles), and the entire ESM load path across 208 support files.

## How it is wired

The root `package.json` of the UIS workspace points at this repository's library package with a `link:`
specifier instead of a version range:

```json
"@lynxwall/cucumber-tsflow": "link:../../../../GitHub/cucumber-js-tsflow/cucumber-tsflow"
```

It was added with:

```sh
cd C:\Git\Azure\uis-tools\Tools.Web\VueApp
corepack pnpm add -D -w "@lynxwall/cucumber-tsflow@link:../../../../GitHub/cucumber-js-tsflow/cucumber-tsflow"
```

pnpm writes the path with backslashes on Windows; it was normalized to forward slashes by hand and
`corepack pnpm install` rerun so the lockfile agrees.

`pnpm` is not on the Git Bash `PATH` on this machine; `corepack pnpm …` from inside the UIS directory
picks up the pinned version from the `packageManager` field.

### Why `link:` and not a tarball

`link:` makes `node_modules/@lynxwall/cucumber-tsflow` a symlink to
`C:\Git\GitHub\cucumber-js-tsflow\cucumber-tsflow`. Node resolves through the symlink to the real path, so:

- **The inner loop is `yarn build` and rerun.** No pack, no reinstall. For performance work that is
  rebuilt many times a session this is the deciding factor.
- **The library's own dependencies** (`@cucumber/cucumber`, `esbuild`, `ts-node-maintained`, `jsdom`, …)
  resolve from this repository's root `node_modules` — the Yarn workspace uses `nodeLinker: node-modules`,
  so they are present. These are the same versions a tarball install would pull.
- **One fidelity difference:** `vue-sfc-compiler.ts` imports `vue/compiler-sfc`, which the library does
  not declare as a dependency. Under a registry or tarball install pnpm's hidden hoist
  (`node_modules/.pnpm/node_modules`) supplies UIS's Vue 3.5.17. Under `link:` it resolves from this
  repository's `node_modules` — Vue **3.5.13**. A patch-level compiler difference against a 3.5.17
  runtime; acceptable for timing work, but it means the linked setup is not a packaging test.

A `file:` tarball (`yarn workspace @lynxwall/cucumber-tsflow pack` → `"file:../path/to/x.tgz"`) is the
faithful install: it honours the `files` allowlist, installs through pnpm's store, and gets UIS's Vue.
It costs a pack plus `pnpm install` per iteration, and pnpm has been known to cache `file:` tarballs by
path, so a version bump or store prune may be needed to pick up changes. Use it as a final check before a
release, not for iteration.

### pnpm workspace policies to be aware of

`pnpm-workspace.yaml` sets `trustPolicy: no-downgrade`, `blockExoticSubdeps: true` and
`minimumReleaseAge: 2880`. None of them rejected the `link:` install. If a `file:` tarball is ever
refused on trust grounds, the escape hatch is a `trustPolicyExclude` entry for
`@lynxwall/cucumber-tsflow@<version>`.

## Running

```sh
# in this repository — after any source change
yarn build

# in C:\Git\Azure\uis-tools\Tools.Web\VueApp
corepack pnpm -F uis-tools-test testUtils      # 49 scenarios, ~30 s — inner loop
corepack pnpm -F uis-tools-test testDim        # 314 scenarios
corepack pnpm -F uis-tools-test test           # full ~1380 — the real measurement
```

Wall-clock is what matters, not the `executing steps` figure cucumber prints; on the `utils` profile the
steps take well under a second and everything else is startup. Wrap the command in `time` or a
`$SECONDS` delta.

**Discard the first run after any `pnpm install` or `yarn build`.** Freshly written files under
`node_modules` or `lib/` are read for the first time on that run, which on this Windows machine pays both a
cold filesystem cache and on-access antivirus scanning. The effect is not small — see the table below — so
a measurement is the steady state of runs two onward, never run one.

## First measurements

Serial `utils` profile, Node 24.16.0, same machine, same session, in the order they were run:

| Run | Build | Scenarios | Executing steps | Wall clock |
| --- | --- | --- | --- | --- |
| 1 | `7.5.5` (registry; first run of the session) | 49 passed | 0.31 s | 107 s |
| 2 | `7.7.2` (this repo, `master`; first run after `pnpm add`) | 49 passed | 0.17 s | 34 s |
| 3 | `7.7.2` (first run after a lockfile-only `pnpm install`) | 49 passed | 0.21 s | 11 s |
| 4 | `7.7.2` | 49 passed | 0.16 s | 11 s |
| 5 | `7.7.2` | 49 passed | 0.15 s | 9 s |

Two conclusions. First, the warm-up penalty is 3–10× the steady-state time, which is why the rule above
exists. Second, the `7.5.5` figure is a single cold run and says nothing reliable about what 7.6–7.7
already recovered; it would need to be re-measured warm to be compared. The steady-state `7.7.2` figure —
roughly **9–11 s** for `utils`, of which under 0.2 s is step execution — is the baseline for the
performance worklist. Every change should be measured as a delta from an unmodified `master` build.

The `utils` profile is the inner loop, not the measurement: it loads `world-context.ts` and three files
under `steps/utils/`, not the 208-file support tree. The `default` profile is what the analyses were
written about and has not yet been timed.

## Undoing it

The `link:` entry and the corresponding `pnpm-lock.yaml` changes are in the UIS working tree and must not
be committed. To restore the registry package:

```sh
cd C:\Git\Azure\uis-tools\Tools.Web\VueApp
git checkout -- package.json pnpm-lock.yaml
corepack pnpm install
```

The UIS branch at the time of setup (`jira/UIST-318`) already carried unrelated local edits to
`package.json`, so `git checkout` of that file will discard those too — review `git diff package.json`
first and revert only the `cucumber-tsflow` line if the rest should stay.
