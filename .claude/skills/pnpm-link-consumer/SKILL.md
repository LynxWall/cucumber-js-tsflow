---
name: pnpm-link-consumer
description: Wire the locally built cucumber-tsflow library into a pnpm consumer project as a `link:` devDependency, verify it resolves, and take a warm timing baseline. Use when asked to test or measure a local build against a real project (e.g. UIS Tools), to "link" the package into a project, or to undo such a link.
argument-hint: [consumer-project-path] [--undo]
---

# Link the local cucumber-tsflow build into a pnpm consumer

The spec matrix in this repo is 28 scenarios; none of the load or runtime costs that matter show up at that
size. Real validation and timing happen against a large consumer project that references the local build
through a pnpm `link:` dependency. This skill performs that wiring end to end.

Arguments: `$ARGUMENTS` — the consumer's workspace-root directory (the one holding `pnpm-workspace.yaml`
or the `package.json` that declares `@lynxwall/cucumber-tsflow`). Pass `--undo` to remove the link and
restore the registry package. If no path is given, default to the known consumer
`C:\Git\Azure\uis-tools\Tools.Web\VueApp` and say so.

Background and prior measurements: [research/local-consumer-testing.md](../../../research/local-consumer-testing.md).

## Why `link:` (and when not)

- `link:` makes `node_modules/@lynxwall/cucumber-tsflow` a symlink to
  `cucumber-tsflow/` in this repo. After that the inner loop is `yarn build` here and rerun there — no pack,
  no reinstall. That is the deciding factor for work that rebuilds many times a session.
- The library's own dependencies resolve from **this repo's** root `node_modules` (Yarn uses
  `nodeLinker: node-modules`, so they exist). Anything the library imports *without* declaring — notably
  `vue/compiler-sfc` in `vue-sfc-compiler.ts` — also resolves from this repo, not the consumer. So a linked
  install is a behavior and timing test, **not a packaging test**. For a packaging check use a `file:`
  tarball from `yarn workspace @lynxwall/cucumber-tsflow pack` instead.
- Only pnpm consumers are covered here. For a Yarn Berry consumer the equivalent is `portal:`; for npm,
  `npm link` or a `file:` directory. Say so and stop if the consumer is not pnpm.

## Procedure

Run each numbered step; do not skip verification steps.

### 1. Inspect the consumer before touching it

From the consumer directory, establish and report:

- Package manager and version: `packageManager` field in `package.json`, presence of `pnpm-lock.yaml`.
  Stop if it is not pnpm.
- **Where** `@lynxwall/cucumber-tsflow` is declared — root `package.json` or a member workspace. Grep all
  `package.json` files excluding `node_modules`. The link must replace the dependency **in the same place**,
  or bins in other workspaces stop resolving.
- Current version range and installed version
  (`node_modules/@lynxwall/cucumber-tsflow/package.json`).
- `git status --short` of `package.json` and `pnpm-lock.yaml`. If they already have uncommitted edits,
  note it — the undo step must not blindly `git checkout` them.
- Whether `pnpm` is on `PATH`. In this repo's Bash tool it usually is not; use `corepack pnpm …` from
  inside the consumer directory, which honors the pinned `packageManager` version.

### 2. Build the library

From this repo root: `yarn build`. It must succeed; then confirm no stray `.js` appeared under
`cucumber-tsflow/src/` (exception: `src/wrapper.mjs`). Record the built version from
`cucumber-tsflow/src/version.ts`.

### 3. Optional: cold baseline on the currently installed version

If the user wants a comparison against the version currently installed, run a small profile **now**, before
linking, and time it with a `$SECONDS` delta around the command. Run it at least twice and keep the second
number — see step 6 for why.

### 4. Add the link

Compute the relative path from the consumer's declaring `package.json` directory to
`<this repo>/cucumber-tsflow`, using forward slashes. Then, from the consumer's workspace root:

```sh
corepack pnpm add -D -w "@lynxwall/cucumber-tsflow@link:<relative-path>"
```

Drop `-w` and `cd` into the member workspace if the dependency is declared there rather than at the root.
Use `-D` only if it was a devDependency before; match what was there.

pnpm on Windows rewrites the specifier with backslashes (`link:..\\..\\…`). Normalize it to forward
slashes so the file is portable, then rerun `corepack pnpm install` so the lockfile agrees:

```sh
sed -i 's#"link:[^"]*cucumber-tsflow"#"link:<relative-path>"#' package.json
corepack pnpm install
```

`pnpm-workspace.yaml` policies seen on real consumers — `trustPolicy: no-downgrade`,
`blockExoticSubdeps: true`, `minimumReleaseAge` — do not block a `link:` install. If a future one does,
the escape hatch is a `trustPolicyExclude` entry for `@lynxwall/cucumber-tsflow@<version>`.

### 5. Verify

All four, and report them:

```sh
grep -n 'cucumber-tsflow"' package.json                       # link: with forward slashes
ls -la node_modules/@lynxwall/ | grep cucumber                 # symlink -> this repo
ls node_modules/.bin/ | grep cucumber-tsflow                   # bin shim present
node -e "console.log(require('<consumer>/node_modules/@lynxwall/cucumber-tsflow/package.json').version)"
```

The version printed must equal the one built in step 2.

### 6. Smoke test and warm baseline

Pick the **smallest** profile in the consumer's `cucumber.json` (list profiles and their `paths` sizes so the
user can see the choice) and run it with a wall-clock delta:

```sh
S=$SECONDS; corepack pnpm -F <test-workspace> <script> 2>&1 | tail -5; echo "wall: $((SECONDS-S))s"
```

Run it **at least three times** and report all numbers. The first run after any `pnpm install` or
`yarn build` reads freshly written files and pays cold filesystem cache plus on-access antivirus scanning;
on Windows this has measured at 3–10× the steady state. The baseline is the steady state of runs two
onward, never run one. Wall clock is the figure that matters — cucumber's `executing steps` line is a
fraction of a second on these profiles; everything else is startup.

All scenarios must pass. If any fail that passed on the registry version, stop and report the diff before
anything else — that is a behavior regression in the local build, not a wiring problem.

### 7. Report and remind

Tell the user:

- the exact `link:` line and where it lives,
- the verified version,
- the timing numbers with the warm-up caveat,
- that `package.json` and `pnpm-lock.yaml` in the consumer are now modified and **must not be committed**,
- that from now on the loop is `yarn build` here, rerun there.

## Undo (`--undo`)

From the consumer directory:

1. `git diff package.json pnpm-lock.yaml` — inspect. If `package.json` carries unrelated local edits, revert
   only the `cucumber-tsflow` line (put the original range back by hand) instead of checking the file out.
2. Otherwise `git checkout -- package.json pnpm-lock.yaml`.
3. `corepack pnpm install`.
4. Verify `node_modules/@lynxwall/cucumber-tsflow` is a real directory again and prints the registry
   version.

## Known consumer

`C:\Git\Azure\uis-tools\Tools.Web\VueApp` — pnpm 11 workspace (`e2e`, `test`, `tools`); dependency
declared at the **root** `package.json`; test workspace is `uis-tools-test`; profiles `utils` (49
scenarios, ~10 s warm), `dim` (314), `default` (~1380, 208 step files). Relative link path from the root:
`../../../../GitHub/cucumber-js-tsflow/cucumber-tsflow`. Transpiler `es-vue-esm`, experimental decorators,
serial.
