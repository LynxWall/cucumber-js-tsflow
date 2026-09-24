# Performance and diagnostics

How `cucumber-tsflow` keeps startup short on a large suite, what it prints while it starts, and how to find out
where the time goes when it does not. Everything here is optional to know: a suite runs the same with none of it
configured. The [README](../README.md) covers writing and running tests; this guide covers the runner's
performance features, its caches and its diagnostics.

- [Startup progress](#startup-progress)
- [Startup timing diagnostics](#startup-timing-diagnostics)
- [Compile cache](#compile-cache)
- [Transpile cache](#transpile-cache)
- [Selective loading](#selective-loading)
- [Watch mode](#watch-mode)
- [ESM loader hooks](#esm-loader-hooks)
- [Cache operations](#cache-operations)
- [Environment variables](#environment-variables)
- [Measuring startup on this repository](#measuring-startup-on-this-repository)

## Startup progress

Between `Running Cucumber-TsFlow in Serial mode.` and the first formatter output, cucumber-tsflow prints one line per startup phase so a large suite never sits silent while it transpiles and loads support code. The phases, in order: resolving the support-code globs and plugins, parsing the feature files into scenarios, transpiling and loading the support files, and launching (BeforeAll hooks, or the parallel workers). Each line starts with a spinner in a fixed slot, then a themed label and a plain-language note on what is actually happening, and ends with a running count (feature files parsed, support files loaded, parallel workers ready). The line is redrawn in place while the phase is open; when it completes the spinner becomes a check mark and the count is replaced by a summary and the elapsed time:

```text
[ ✓ ] Prepping the cucumbers — resolving support-code globs and plugins 312 support files, 84 feature files, 41ms
[ ✓ ] Making the brine — parsing 84 feature files into scenarios 6 scenarios to run, 212ms
[ / ] Packing the jars — transpiling and loading 312 support files with es-node-esm 41/312
```

The spinner is the classic four-frame ASCII line spinner (`|`, `/`, `-`, `\`) in brackets, advanced every 130 ms, and its color walks a twelve-color wheel (blue, green, yellow, orange, red, purple, with a blend between each pair) one step every five frames. A new color enters at the left bracket and sweeps across the glyph and the right bracket over three frames, and because five is not a multiple of the four frames in a rotation the sweep starts one glyph later each time, drifting around the turn like an offbeat and coming back into step every twenty frames. It is drawn the moment the phase line is printed, so there is motion before the first file finishes loading, and it is driven by a small worker thread that writes directly to the terminal. That matters because the main thread spends most of a phase blocked in synchronous work: the first support file's `import()` runs its whole dependency graph through the transpiler before it returns, and the CommonJS transpilers load every file with a synchronous `require()`. A spinner on the main thread would freeze for that entire stretch; the worker has its own event loop and keeps turning. Phase lines are never shortened to fit the terminal: in a narrow window the text wraps onto as many rows as it needs and is redrawn there, and widening the window shows the line as intended.

The last phase covers `BeforeAll` hooks in serial mode and, in parallel mode, every child process loading the support code again; it ends when the first scenario starts and the formatter takes over. A phase that ends in failure (support code that did not load, a `BeforeAll` hook that threw) closes with `[ ✗ ]` instead of the check mark, and the error is reported once, after the line has closed.

Messages appear on their own line directly beneath the active phase, replace one another in place, and clear themselves after about eight seconds. If a phase goes thirty seconds without a message, a themed remark with the running count appears; while nothing has completed yet it explains why (the first support file pulls in its whole import graph before it counts). When work has been quick again for a while after a stall that long — five files in a row, each within a second of the last, since the unit that ended the stall is often followed by another slow one — a relief message takes the slot instead:

```text
[ - ] Packing the jars — transpiling and loading 312 support files with es-node-esm (2/312)
      phew, that was a big jar. Back to the quick ones
```

The theme is chosen with `TSFLOW_THEME`:

| Value         | Effect                                                                                                                              |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| unset / other | Default pickling theme shown above (labels and check mark in muted steel blue)                                                      |
| `lotr`        | The Lord of the Rings: the Fellowship assembles, the beacons of Gondor are lit, the Rohirrim muster (labels and check mark in gold) |
| `off`         | No startup progress output                                                                                                          |

```bash
TSFLOW_THEME=lotr npx cucumber-tsflow -p default
```

The spinner, counter and message line are only drawn when stdout is an interactive terminal. In CI logs and when stdout is redirected to a file the output is append-only: the phase line, any messages, and the summary. Nothing of it reaches formatter output or report files. Anything your support code writes to stdout while a phase is open (for example a `console.log` in a hook running inside a parallel worker) lands inside that line and can displace the spinner, exactly as it would land among the formatter's own progress dots.

Before any of that, the `cucumber-tsflow` command prints a plain line as its very first action, `Bootstrapping cucumber-tsflow 7.7.2 on Node v24.16.0: loading the library and its dependencies...`, and a second one, `cucumber-tsflow loaded in 431 ms.`, once the library has loaded and just before `Loading configuration`. That stretch is Node loading several hundred modules: normally under half a second, and nothing of cucumber-tsflow's runs during it, so there is no spinner or theme, only the two lines in the same dimmed gray as the phase details. They are skipped for `--version`, `--help`, `--i18n-languages` and `--i18n-keywords`, whose output a script may parse, and when `TSFLOW_THEME=off`.

## Startup timing diagnostics

Set `TSFLOW_TIMING=true` to find out where startup time goes. When the run completes, cucumber-tsflow prints a report to stderr with the wall-clock time of each startup phase, the same phases for every parallel child process, per-context file totals, and a table of the 25 slowest files by transpile, ESM load, and top-level require/import time.

```bash
TSFLOW_TIMING=true npx cucumber-tsflow -p default
```

The report is diagnostic output only and does not change how tests run. Without the variable set, the instrumentation is inactive: every instrumentation point is a single boolean check. `TSFLOW_VERBOSE=true` remains available for untimed checkpoint logging.

The report has three parts. Every line is prefixed `[tsflow:timing]` so it can be separated from the formatter's output; a small run of this repository's own specs looks like this:

```text
Startup timing report (pid 17452, 1167 ms since process start)

Main process
  phase                      ms  calls
  bootstrap                 412      1
  config                    6.1      1
  gherkin                   5.8      1
  support:require-modules   143      1
  transpile-cache:hit       335     12
  support:require           504      1
  support:finalize          1.8      1
  registry:update           2.8      1
  formatters:init            40      1
  runtime:run                28      1

File totals by context (each context transpiles its own copy of every file it loads)
  context  contexts  files  transpile ms  load ms  evaluate ms
  main            1     12           335      0.0          504

Slowest 12 files (transpile = transpiler only, load = ESM load hook, evaluate = top-level require/import including dependencies)
  transpile ms  load ms  evaluate ms  context  file
            25      0.0          281  main     src\step_definitions\world-context.ts
            28      0.0          223  main     src\step_definitions\basic-test.ts
```

- **The phase table**, one per context. `bootstrap` is Node loading the library (the stretch the bootstrap notice covers), `config` the configuration, `gherkin` parsing the feature files, `support:require-modules` the `requireModule` entries (the CommonJS transpilers), `support:require` and `support:import` the support files themselves including everything they pull in, `support:register-loaders` attaching the ESM loaders, `support:finalize` and `registry:update` building the CucumberJS library and back-patching it with the decorator metadata, `formatters:init` the formatters, and `runtime:run` the test run itself. The rows for the caches count rather than time: `transpile-cache:hit` and `transpile-cache:miss` have the number of transpiles served from and written to the [transpile cache](#transpile-cache) in their `calls` column, `transpile-cache:prune` is the sweep that bounds it, and `selective-load:plan` and `selective-load:index` are the two halves of [selective loading](#selective-loading). Under the esbuild ESM loaders the `esm:hooks-init`, `esm:resolve` and `esm:load` rows are the loader's hooks, in the table of the context that registered them; a loader on Node's loader hooks thread gets a table of its own, `esm-hooks`.
- **File totals by context.** A parallel run has a `main` context and one `worker:<id>` per child process, and each child transpiles and evaluates every support file again. The `contexts` column says how many times, which is the N+1 multiplication a parallel run pays at startup and the reason the transpile cache is shared between them.
- **The slowest files.** `transpile` is the transpiler alone (esbuild or the Vue SFC compiler; ts-node's TypeScript compile is not observable and shows as zero), `load` the ESM `load` hook, and `evaluate` the top-level `require` or `import` of the file including everything it imports, which is why the first support file loaded is often the slowest: it pays for the framework, jsdom and the component library that every later file finds already loaded. A cache hit still records a `transpile` entry, for the lookup time, so file counts are comparable between a cold and a warm run.

Read the report before changing anything: on a large suite the cost is almost always module evaluation of the support files' dependency graph, not cucumber-tsflow's own work, and the second run of an unchanged tree should be much faster than the first because of the caches.

## Compile cache

On Node 22.8 or later the `cucumber-tsflow` command enables Node's module compile cache, so the V8 bytecode for the library, its dependencies and your transpiled support code is reused across runs, and parallel child processes share the same cache directory. Set `NODE_DISABLE_COMPILE_CACHE=1` to turn it off, or `NODE_COMPILE_CACHE=<dir>` to choose where it lives (Node's default is a `node-compile-cache` directory under the OS temp directory). Both are Node's own switches. On Node 22.0 to 22.7 the cache is not available and the command skips it.

## Transpile cache

The esbuild transpilers (`es-node`, `es-vue`, `es-node-esm`, `es-vue-esm`) and the Vue SFC compiler behind every Vue transpiler store their output on disk, so a run whose sources have not changed reads the transpiled code back instead of transpiling it, and the coordinator and its parallel child processes share one cold transpile of each file instead of each doing their own. Entries are content-addressed: the key is a hash of the file's source and path, the transpiler options (including the decorator mode and the Vue `<style>` flag), the tsconfig `paths` the ESM loaders bake into their output, the esbuild and Vue compiler versions, and the cucumber-tsflow version, so any change to the source or the tooling is a new key and a stale entry is never served. The cache lives in `node_modules/.cache/cucumber-tsflow/transpile` (see [Cache operations](#cache-operations) for exactly where) and is bounded to 512 MB, oldest entries evicted first. The load-phase progress line reports how many transpiles were served from it, and the `TSFLOW_TIMING` report has `transpile-cache:hit` and `transpile-cache:miss` rows whose `calls` column is the count.

`--no-transpile-cache` (or `transpileCache: false` in a profile, or `TSFLOW_TRANSPILE_CACHE=false` in the environment) transpiles everything from source and neither reads nor writes the cache; `TSFLOW_TRANSPILE_CACHE_DIR=<dir>` chooses where it lives. The TypeScript output of the `ts-node` and `ts-vue` transpilers comes from ts-node's TypeScript compiler and is not cached; their `.vue` compilation is.

## Selective loading

Running one scenario in a large suite normally costs the same startup as running all of them: every support file is transpiled and evaluated before cucumber-tsflow finds out that the scenario needed three of them. With `selectiveLoad: true` (or `--selective-load`, or `TSFLOW_SELECTIVE_LOAD=true`), a run that selects a subset of scenarios — with `--name`, `--tags`, a feature file or a `file:line` on the command line, or a profile whose `paths` cover part of the suite — loads only the support files it needs. Feature files are parsed first, and the selected steps are matched against an index of step patterns that earlier runs wrote to `node_modules/.cache/cucumber-tsflow/selective-load` (beside the transpile cache, one file per configuration). The load-phase progress line says what happened: `transpiling and loading 14 of 214 support files with es-vue-esm (200 skipped: not used by the selected scenarios)`.

What is loaded, and what is not:

- A support file is loaded when any selected step's text matches one of the step patterns it registered, matched with the same Cucumber expression and regular expression classes CucumberJS uses and with the parameter types the support code defines. Every file with a matching pattern is loaded, so an ambiguity or a tag-scoped alternative in another file is present exactly as in a full run.
- A support file is always loaded when it registered anything other than step definitions: a hook (`@before`, `@after`, `@beforeAll`, …), a parameter type (`defineParameterType`), a World constructor, a default timeout, a definition wrapper, or nothing at all. Set-up files, `World` files and context classes therefore always load.
- A support file is loaded when it is new to the index, or when any module in its import graph — the file itself, the modules it imports, and theirs — has changed since the index recorded it (by modification time and size). The graph comes from Node's own module cache for `require` and from the ESM loader's resolve hook for `import`, so a pattern that lives in a shared helper is attributed to every file that imports it.
- If any selected step matches no indexed pattern, every support file is loaded, so an undefined step is reported exactly as a full run would report it, and the progress line names the step.

The first run with the option on loads everything and writes the index; every run refreshes the records of the files it loaded and keeps the validated records of the files it skipped, so the index tracks edits without ever being rebuilt from scratch. Parallel child processes load the same subset as the coordinator.

The option is off by default because it rests on one assumption the tool cannot check: that a support file which only defines step definitions has no other effect on the run. A file that patches a global at module level, registers a Vue plugin, or otherwise sets something up as a side effect of being imported — and also defines steps — is skipped when its steps are not selected. Move such set-up into a file of its own (which, having no step definitions, always loads) or into a hook. Two smaller limits: step patterns that are not literals in the module graph (read from a file or the environment) are not tracked, and step definitions inside `node_modules` are not either. Selective loading is unavailable, and every file is loaded, with the `ts-node-esm` and `ts-vue-esm` transpilers, with any third-party `loader`, and under `TSFLOW_ESM_HOOKS=async`: those loaders run on Node's loader hooks thread, where the import graph cannot be observed; the progress line says so. Report formatters that list step definitions (`usage`, the message stream) see only the definitions that were loaded.

Startup phases with `TSFLOW_TIMING=true`: `selective-load:plan` is the time to read the index and match the selected steps, `selective-load:index` the time to record the loaded files' import graphs and write it back.

## Watch mode

`cucumber-tsflow --watch` (or `-w`, or `watch: true` in a profile, overridden by `--no-watch`) runs the configuration, then stays running and runs it again whenever a feature file, a support file or a module the support code loaded changes, or when you press Enter. `q` (or Ctrl-C) quits. Any filter on the command line (`--name`, `--tags`, a feature file or `file:line`) applies to every run, so the inner loop for one scenario is `cucumber-tsflow -p default --name "the scenario" --watch`.

The point is what the process keeps between runs. A fresh process spends most of a filtered run's startup loading modules that never change between two edits: the test framework, jsdom, Vue and a component library, the project's shared helpers. In watch mode those stay loaded, and a rerun evaluates again only what has to run again:

- support files that registered anything on the previous run — step definitions, hooks, parameter types, a World constructor, a default timeout or a definition wrapper — because CucumberJS's library is rebuilt from scratch for every run and their decorators have to fire again. A set-up file that registered nothing (the jsdom initialization, say) is evaluated once and kept;
- the files that changed, every project module that imports or requires them, directly or through other modules, and every new file;
- any module that applies `@binding` decorators without being a support file itself (a helper imported by one).

The load-phase progress line reports the decision: `transpiling and loading 216 support files with es-vue-esm (rerun 3: 24 evaluated again, 192 kept loaded, 2 other modules)`. Selective loading composes with it: with `selectiveLoad` on, a rerun evaluates only the files the selected scenarios need among those. Because a module that must load again cannot be removed from Node's ES module map, an ES module evaluated again is imported under a `?tsflow=<n>` query, which is what its URL looks like in a stack trace; reported step locations are unaffected.

Watch mode changes nothing about how a run executes and each run writes its report files as usual. What it cannot undo is the resident state of the modules it keeps: module-level state in a kept module persists between runs, and a class re-evaluated in one run is not `instanceof`-compatible with an instance a module-level singleton kept from the previous one (scenarios create their instances afresh, so this only matters to code that caches instances across runs). Configuration read once at startup is kept too: a change to `cucumber.json` or to the tsconfig `paths` the loaders resolve with needs a restart. If a rerun behaves differently from a fresh run, quit and start again.

The same goes for memory. Whatever a run leaves behind in a kept module — components mounted into the jsdom `document` and never unmounted, spies and mocks registered with a test framework shim and never reset, caches in a store — is discarded when a fresh process exits but stays in a resident one, and the next run adds its own. The status line after each run shows the heap the next run starts from (`Run took 41.5s, heap 2.5 GB`; measured after a full collection when Node runs with `--expose-gc`, as it stands otherwise). If that figure climbs run after run, the suite is keeping state between scenarios: clean it up in an `@after` hook (for example `cleanup()` from a testing library, and whatever resets the mocks), or accept the growth and start with `NODE_OPTIONS=--max-old-space-size=8192`, or use watch mode for what it is meant for, a filtered inner loop, and run the whole suite in a fresh process. A suite whose scenarios clean up after themselves stays flat. Files in a directory that held no known file when the last run finished are not watched until a rerun picks them up: press Enter. With the `ts-node-esm` and `ts-vue-esm` transpilers, any third-party `loader`, or `TSFLOW_ESM_HOOKS=async`, the loader runs on Node's loader hooks thread, where modules cannot be reloaded in place, so watch mode still watches and reruns but each run is a fresh `cucumber-tsflow` process; the first line printed says so. `--exit`/`--force-exit` is ignored while watching.

## ESM loader hooks

On Node 22.15 / 23.5 or later the `es-node-esm` and `es-vue-esm` transpilers attach their `resolve` and `load` hooks with `module.registerHooks()`, so they run synchronously on the thread that is importing your support code instead of on a separate loader thread with a message round trip per module. They also transpile TypeScript with esbuild directly rather than through a `ts-node` service. On older Node versions the same loaders fall back to `module.register()`; set `TSFLOW_ESM_HOOKS=async` to force that behavior. `ts-node-esm` and `ts-vue-esm` always use `module.register()`, because ts-node's hooks are asynchronous. Where the loader runs decides two features: selective loading and in-place reloading in watch mode both need to observe the import graph, which only an in-thread loader can, so both are unavailable (and say so) under `module.register()`.

## Cache operations

cucumber-tsflow keeps two stores of its own on disk and enables a third that belongs to Node. None of them changes what a run computes: a cache can change whether a transpile runs or a file loads, never what the result is, so deleting any of them costs one slower run and nothing else.

**Where the cache root is.** Both cucumber-tsflow stores live under one root, `.cache/cucumber-tsflow`, placed inside the nearest `node_modules` directory at or above the working directory the command runs in. When no directory on that walk has a `node_modules`, the root goes under the nearest directory with a `package.json` (as `node_modules/.cache/cucumber-tsflow`, created on first write); when there is neither, it is `cucumber-tsflow` under the OS temp directory. The root is resolved once per process. Run the command from the folder that holds the project's `cucumber.json`, as the README recommends, and the caches land in that project's `node_modules/.cache`, which package managers already ignore and CI systems can restore between builds.

| Cache | Contents | Location | Turn off | Bounded | Clear |
| --- | --- | --- | --- | --- | --- |
| Transpile cache | esbuild output and compiled Vue SFCs, one JSON file per entry, content-addressed | `<root>/transpile`, or `TSFLOW_TRANSPILE_CACHE_DIR=<dir>` | `--no-transpile-cache`, `transpileCache: false`, or `TSFLOW_TRANSPILE_CACHE=false` | Yes: 512 MB, least recently written entries deleted first, swept at the end of a run that wrote entries | Delete the directory |
| Selective-load index | Step patterns, import graphs and file stamps per support file, one JSON file per configuration | `<root>/selective-load` | Leave `selectiveLoad` off (the default) | No; each file is small, and there is one per distinct configuration (working directory, support globs, decorator mode and library version) | Delete the directory |
| Node compile cache | V8 bytecode for every module the process loads | Node's default under the OS temp directory, or `NODE_COMPILE_CACHE=<dir>` | `NODE_DISABLE_COMPILE_CACHE=1` | Not by cucumber-tsflow, which never deletes anything from it | Delete the directory |

Clearing is never required for correctness. The transpile cache is keyed on everything that shapes its output (source, path, options, tool and library versions), so a stale entry cannot be served; the selective-load index validates every skipped file's import graph against the recorded modification times and sizes before trusting it, and loads the file when anything differs; Node keys its compile cache on the source. Reasons to clear anyway: to reclaim disk space (the transpile cache bounds itself; the index and the compile cache do not, and an upgrade of cucumber-tsflow leaves the previous version's entries behind in both stores until the sweep or a delete removes them), or to rule a cache out while investigating a run that behaves unexpectedly, in which case `--no-transpile-cache` and `--no-selective-load` do the same for one run without deleting anything.

`TSFLOW_TRANSPILE_CACHE_DIR` moves only the transpile cache; the selective-load index stays under the root. `TSFLOW_TRANSPILE_CACHE=false` is how the `transpileCache` option reaches every thread and child process, so setting the variable and the option are the same thing; an environment value acts as the default when the option is not set.

## Environment variables

Every variable cucumber-tsflow reads, in one place. The `TSFLOW_*` variables are cucumber-tsflow's; the `NODE_*` ones are Node's, listed because the command sets or honors them.

| Variable | Effect |
| --- | --- |
| `TSFLOW_TIMING=true` | Print the [startup timing report](#startup-timing-diagnostics) to stderr when the run ends |
| `TSFLOW_VERBOSE=true` | Print internal checkpoint logging, including the per-file resolve, load and transpile checkpoints and the stacks of load errors |
| `TSFLOW_THEME=<name>` | Choose the [startup progress](#startup-progress) theme: default pickling, `lotr`, or `off` for no startup output at all (also silences the bootstrap notice) |
| `TSFLOW_TRANSPILE_CACHE=false` | Neither read nor write the [transpile cache](#transpile-cache); the environment form of `transpileCache: false` |
| `TSFLOW_TRANSPILE_CACHE_DIR=<dir>` | Where the transpile cache lives, instead of `node_modules/.cache/cucumber-tsflow/transpile` |
| `TSFLOW_SELECTIVE_LOAD=true` | The environment form of `selectiveLoad: true` |
| `TSFLOW_ESM_HOOKS=async` | Attach the esbuild ESM loaders with `module.register()` on Node's loader hooks thread instead of in-thread (see [ESM loader hooks](#esm-loader-hooks)) |
| `NODE_COMPILE_CACHE=<dir>` | Where Node's compile cache lives; the command sets it for its child processes when Node enables the cache |
| `NODE_DISABLE_COMPILE_CACHE=1` | Do not enable Node's compile cache |
| `NODE_OPTIONS=--max-old-space-size=<MB>` | Node's heap limit, the usual answer to a watch session whose heap grows because scenarios do not clean up after themselves |

## Measuring startup on this repository

The repository has a benchmark script that runs one of the spec workspaces under `TSFLOW_TIMING` with a fixed profile and prints the phases that matter side by side for several runs, so a change to loading, transpiling or registration can be judged without a large consumer project:

```bash
yarn bench                       # the node workspace (CommonJS, es-node), three runs on the project's caches
yarn bench --workspace node-esm  # the ESM workspace (es-node-esm)
yarn bench --cold                # run 1 with empty transpile and compile caches, runs 2 and 3 warm
yarn bench --runs 5 --report     # more runs, and the full timing report of the last one
```

The script is [scripts/benchmark.mjs](../scripts/benchmark.mjs); it needs a built library (`yarn build`) and runs the `bench` profile of the chosen workspace (`node`, `node-esm`, `vue` or `vue-esm`), which loads every step file of that workspace against its feature files with the progress formatter and no report files. It is not a CI gate: the numbers vary with the machine and with what else is running, and the spec workspaces are small enough that most of a run is fixed cost. What they are good for is a before-and-after on the same machine in the same session, and a sanity check that the caches work: with `--cold`, run 1 should show every transpile as a miss and runs 2 and 3 should show every transpile as a hit with a shorter support load.

Reference numbers from the machine the branch was developed on are in the table below. They are a point of comparison for the shape of a run, not a target; expect different absolute values on a different machine.

Taken on 2026-09-24 with `yarn bench --workspace <name> --cold --runs 3` on Windows 11 and Node 24.16.0, from a built tree with nothing else running. `total` is the time from process start to the end of the run as the report measures it; `support load` is the sum of the support-code phases (`support:require-modules`, `support:require`, `support:import`); `transpile cache` is the number of transpiles served from disk or written to it. Run 1 starts with an empty transpile cache **and** an empty Node compile cache, which is why the Vue workspace's first run spends 25.7 s in `support:require-modules`: that is V8 compiling jsdom and Vue from source, which a project whose compile cache is intact never pays; runs 2 and 3 are the steady state.

| Workspace | Transpiler | Run | total ms | bootstrap | support load | test run | transpile cache |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `node` | `es-node` | 1 (cold) | 1516 | 773 | 612 | 42 | 20 misses |
| `node` | `es-node` | 2 | 1112 | 688 | 297 | 48 | 20 hits |
| `node` | `es-node` | 3 | 959 | 536 | 292 | 52 | 20 hits |
| `node-esm` | `es-node-esm` | 1 (cold) | 1254 | 542 | 462 | 46 | 10 misses |
| `node-esm` | `es-node-esm` | 2 | 953 | 578 | 138 | 40 | 10 hits |
| `node-esm` | `es-node-esm` | 3 | 822 | 505 | 111 | 45 | 10 hits |
| `vue` | `es-vue` | 1 (cold) | 27589 | 504 | 26932 | 69 | 23 misses |
| `vue` | `es-vue` | 2 | 1905 | 583 | 1182 | 69 | 23 hits |
| `vue` | `es-vue` | 3 | 1602 | 487 | 979 | 71 | 23 hits |
| `vue-esm` | `es-vue-esm` | 1 (cold) | 1826 | 491 | 1069 | 66 | 15 misses |
| `vue-esm` | `es-vue-esm` | 2 | 1869 | 710 | 869 | 76 | 15 hits |
| `vue-esm` | `es-vue-esm` | 3 | 1526 | 575 | 708 | 64 | 15 hits |

What the shape says: on suites this small the fixed costs dominate. `bootstrap`, Node loading the library and its dependencies, is half of a warm run, and the caches turn the support load of a cold run into a fraction of itself (`node`: 612 ms to about 295 ms; `vue`: 1.2 s to 1.0 s once the compile cache is warm, with the rest being jsdom's own start-up). The test run itself is under a tenth of a second in every workspace. A change that moves `bootstrap` or the warm support load by more than the run-to-run noise (about 10%) is visible here; one that only matters at two hundred support files is not, and needs the real suite.

For a real measurement, use a real suite: the notes in [research/local-consumer-testing.md](../research/local-consumer-testing.md) describe how the library was linked into a 1571-scenario Vue project and timed, and the phase hand-offs under [research/execution-strategy/](../research/execution-strategy/) record what each change measured there.
