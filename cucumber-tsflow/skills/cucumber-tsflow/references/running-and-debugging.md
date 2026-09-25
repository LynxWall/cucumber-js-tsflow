# Running and debugging

Detail behind [SKILL.md](../SKILL.md). Run commands from the folder that holds the `cucumber.json` and the
`tsconfig.json` the tests use.

## Selecting what runs

Filters combine with the profile's own `paths` and `tags`:

```sh
npx cucumber-tsflow -p default features/cart.feature
npx cucumber-tsflow -p default features/cart.feature:12:30      # scenarios at lines 12 and 30
npx cucumber-tsflow -p default --name "checks out"              # regular expression on scenario names
npx cucumber-tsflow -p default --tags "@cart and not @wip"
npx cucumber-tsflow -p default --debug-file features/step_definitions/cart-steps.ts
```

`--debug-file` runs every feature that uses a step defined in the given step file, which is handy from an
editor's "current file" variable.

Exit codes: `0` all passed; `1` invalid configuration or an unhandled error; `2` pending, undefined, unknown or
ambiguous steps but nothing failed; `3` at least one step failed. A package-manager script may report its own
code; call `npx cucumber-tsflow` directly to see the real one.

## Watch mode

```sh
npx cucumber-tsflow -p default --name "checks out" --watch
```

- Runs once, then reruns when a feature file, a support file or a module the support code imported changes, or
  when Enter is pressed. `q` or Ctrl-C quits. Command-line filters apply to every rerun.
- A rerun keeps unchanged modules loaded (frameworks, jsdom, Vue, shared helpers) and evaluates again only the
  support files that registered something, the changed files and everything that imports them. That is what
  makes it fast, and it has two consequences:
  - Module-level state in a kept module survives between runs. A rerun that behaves differently from a fresh
    run means some state is cached across runs; quit and start again to confirm.
  - Anything a run leaves behind (mounted components, registered spies, store contents) accumulates. The status
    line after each run shows the heap; if it climbs, add clean-up to an `@after` hook.
- Use watch mode for a filtered inner loop. Run the full suite in a fresh process.
- With `ts-node-esm`, `ts-vue-esm`, a third-party loader, `TSFLOW_ESM_HOOKS=async`, or `es-*-esm` on Node older
  than 22.15, every run is a fresh child process; the line under the `Watch mode:` banner says so.

## Selective loading

`--selective-load` (or `selectiveLoad: true`) makes a filtered run load only the step files whose patterns the
selected steps match, plus every support file that registers anything other than step definitions (hooks,
parameter types, a World, a default timeout) and every file that is new or whose import graph changed. The first
run with it on loads everything and writes an index.

It assumes a file that defines only steps has no other effect when imported. Keep side effects (global patches,
plugin registration) in files without step definitions, or in hooks. It is off for `ts-node-esm`, `ts-vue-esm`,
third-party loaders, `TSFLOW_ESM_HOOKS=async`, and `es-*-esm` on Node older than 22.15 (the loader then runs on
Node's hooks thread, where imports cannot be tracked). The load-phase progress line reports how many files were
skipped.

## Caches

| Cache | Location | Disable | Clear |
| --- | --- | --- | --- |
| Transpile cache (esbuild and Vue SFC output) | `node_modules/.cache/cucumber-tsflow/transpile` | `--no-transpile-cache`, `TSFLOW_TRANSPILE_CACHE=false` | Delete the folder |
| Selective-load index | `node_modules/.cache/cucumber-tsflow/selective-load` | leave `selectiveLoad` off | Delete the folder |

The `node_modules` used is the nearest one at or above the working directory. The transpile cache key covers the
source, the options and every tool version, so a stale entry is never served; clearing it is only needed to
reclaim disk space or to rule the cache out while investigating. `TSFLOW_TRANSPILE_CACHE_DIR` moves it.

The package's [performance and diagnostics guide](https://github.com/LynxWall/cucumber-js-tsflow/blob/master/docs/performance-and-diagnostics.md)
describes the caches, the timing report, selective loading and watch mode in full.

## Environment variables

| Variable | Effect |
| --- | --- |
| `TSFLOW_TIMING=true` | Print a startup timing report to stderr when the run ends: phases, parallel workers, slowest files |
| `TSFLOW_VERBOSE=true` | Print internal checkpoint logging |
| `TSFLOW_THEME=off` | No startup progress lines (also `lotr` for a different theme) |
| `TSFLOW_SELECTIVE_LOAD=true` | Same as `--selective-load` |
| `TSFLOW_ESM_HOOKS=async` | Force the ESM loaders onto Node's loader hooks thread (`module.register()`) |

Everything cucumber-tsflow prints itself (the bootstrap and configuration lines, the startup progress, notices,
watch-mode status lines) goes to stderr, so stdout carries only formatter output and can be piped or parsed. The
startup progress lines are drawn in place only when stderr is an interactive terminal; in CI and redirected output
they are plain append-only lines, and they never appear in formatter output or report files.

## Reading common errors

- **An undefined step** is reported with a snippet to paste. Check the step file is matched by the profile's
  `require` or `import` glob before assuming the pattern is wrong.
- **`Ambiguous step definitions for '<pattern>'`** lists every candidate. Delete the duplicate or tag-scope
  the alternatives.
- **`Cannot find matched step definition for <pattern> with tag <tags>`** means only tag-scoped alternatives
  exist and the scenario carries none of their tags. Add an untagged definition or tag the scenario.
- **An error before any scenario runs** comes from loading the support code: the stack (or, from a loader on
  Node's hooks thread, the `Failed to import support file "<path>"` message) names the file that threw. A
  syntax error, a missing module and a decorator-mode mismatch are the usual causes, and the exit code is `1`.
- **Stack frames with `?tsflow=<n>`** come from a watch-mode rerun that re-imported that ES module. They are
  the same file.
- **A slow start** on a large suite: run once with `TSFLOW_TIMING=true` and read the slowest-files table
  before changing anything. The second run of an unchanged tree should be much faster than the first, because
  of the transpile cache.

## Debugging in VS Code

```json
{
	"name": "Debug current step file",
	"type": "node",
	"request": "launch",
	"program": "${workspaceFolder}/node_modules/@lynxwall/cucumber-tsflow/bin/cucumber-tsflow.js",
	"args": ["-p", "default", "--debug-file", "${file}"],
	"cwd": "${workspaceFolder}",
	"console": "integratedTerminal",
	"sourceMaps": true
}
```

Breakpoints in `.ts` step files bind through the transpilers' source maps.
