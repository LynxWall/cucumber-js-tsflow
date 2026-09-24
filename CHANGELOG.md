# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/)
and this project adheres to [Semantic Versioning](http://semver.org/).

Please see [CONTRIBUTING.md](https://github.com/LynxWall/cucumber-js-tsflow/blob/master/CONTRIBUTE.md) on how to contribute to cucumber-tsflow.

## [Unreleased]

### Added

- **Startup timing instrumentation** (`TSFLOW_TIMING=true`) — records wall-clock time per startup phase (`bootstrap`, `config`, `support:require-modules`, `support:require`, `support:register-loaders`, `support:import`, `support:finalize`, `registry:update`, `formatters:init`, `gherkin`, `runtime:run`) and per file (esbuild/Vue transpile, ESM `load` hook, top-level `require`/`import`), then prints a report to stderr when the run completes. Timings from the ESM loader hooks thread and each parallel child process are collected and aggregated in the main process, so the report shows how many times every file is transpiled across contexts and a "slowest 25 files" table. Every instrumentation point is a single boolean check when the variable is not set.
- New `initialize` export on the ESM loaders (`esnode-loader`, `esvue-loader`, `tsnode-loader`, `vue-loader`) and a `TIMING` worker-to-coordinator IPC message, both used only to carry timing data.
- **`@lynxwall/cucumber-tsflow/bindings` entry point** — the decorators (`binding`, `given`, `when`, `then` and the hooks), the context classes and the CucumberJS support-code helpers (`DataTable`, `World`, `world`, `context`, `Status`, `defineParameterType`, `setDefaultTimeout`, `setWorldConstructor`, …) without the formatters, snippet syntax and CLI that the package root also exports. A support file importing from it loads 239 modules instead of the root's 540 (warm cache, Node 24). The package root re-exports everything in it, so existing imports keep working; a `bindings/index.d.ts` stub covers TypeScript configurations that do not read `exports`.
- **V8 compile cache.** The `cucumber-tsflow` CLI enables Node's module compile cache (`module.enableCompileCache()`, Node 22.8 or later) before loading anything and exports the directory through `NODE_COMPILE_CACHE`, so parallel child processes read the same cache from their first module. `NODE_DISABLE_COMPILE_CACHE=1` turns it off and `NODE_COMPILE_CACHE=<dir>` chooses the directory; both are Node's own switches. On Node 22.0–22.7 the call is skipped.
- **Bootstrap notice.** The `cucumber-tsflow` command prints `Bootstrapping cucumber-tsflow <version> on Node <version>: loading the library and its dependencies...` as its first action, before requiring the library, and `cucumber-tsflow loaded in N ms.` once it has, so the stretch before `Loading configuration` — normally under half a second, but the longest silent part of a run on a loaded machine — says what it is. Dimmed gray text on stdout (the phase-detail color), no spinner or theme; skipped for `--version`, `--help`, `--i18n-languages` and `--i18n-keywords`, and under `TSFLOW_THEME=off`.
- **On-disk transpile cache.** The esbuild transpilers (`es-node`, `es-vue`, `es-node-esm`, `es-vue-esm`) and the Vue SFC compiler behind every Vue transpiler now store their output in `node_modules/.cache/cucumber-tsflow/transpile` (under the nearest `node_modules` at or above the working directory; the OS temp directory when there is none; `TSFLOW_TRANSPILE_CACHE_DIR=<dir>` to choose), so a run whose sources are unchanged reads transpiled code back instead of transpiling it, and the coordinator and its parallel child processes share one cold transpile per file instead of each doing their own. Entries are content-addressed on a SHA-256 of the source, the file path, the transpiler options (decorator mode, Vue `<style>` flag, output format), the tsconfig `paths` and `baseUrl` the ESM loaders bake into their output, and the esbuild, Vue compiler and cucumber-tsflow versions, so a stale entry cannot be served; writes are atomic (temp file plus rename) and best-effort, and the directory is bounded to 512 MB with the oldest entries evicted first. New `transpileCache` option (`--transpile-cache` / `--no-transpile-cache`, default true; `TSFLOW_TRANSPILE_CACHE=false` is the equivalent environment switch and is honored as the default when the option is not set) turns it off. The load-phase progress line reports `N of M transpiles from the cache`, and the `TSFLOW_TIMING` report gains `transpile-cache:hit` / `transpile-cache:miss` rows whose `calls` column is the count (a hit still records a `transpile` file entry, for the lookup time, so file counts stay comparable between cold and warm runs) and a `transpile-cache:prune` row. ts-node's own TypeScript output (`ts-node`, `ts-vue`, `ts-node-esm`, `ts-vue-esm`) is not cached; the `.vue` compilation of `ts-vue` and `ts-vue-esm` is.
- **Selective support loading** (`selectiveLoad: true`, `--selective-load` / `--no-selective-load`, or `TSFLOW_SELECTIVE_LOAD=true`; off by default). On a filtered run — `--name`, `--tags`, a feature file or `file:line`, or a profile covering part of the suite — only the support files the selected scenarios need are transpiled and loaded. The selected steps' texts are matched, with CucumberJS's own expression classes and the parameter types the suite defines, against an index of step patterns per support file that earlier runs wrote to `node_modules/.cache/cucumber-tsflow/selective-load`; every file with a matching pattern is loaded, as is every file that registered anything other than step definitions (hooks, parameter types, a World constructor, a default timeout, a definition wrapper, or nothing at all), every file new to the index, and every file whose import graph — tracked through `require.cache` for `require` paths and the esbuild ESM loaders' resolve hook for `import` paths — has changed since it was recorded. A selected step that matches no indexed pattern loads everything, so undefined steps are reported as in a full run. The first run writes the index; each run refreshes the records of the files it loaded and keeps the rest. Parallel children load the same subset. The load-phase progress line reports `N of M support files … (K skipped: not used by the selected scenarios)` or the reason everything was loaded; `TSFLOW_TIMING` gains `selective-load:plan` and `selective-load:index`. Unavailable (everything loads, and the line says so) with `ts-node-esm`, `ts-vue-esm`, third-party loaders and `TSFLOW_ESM_HOOKS=async`, whose hooks run on Node's loader hooks thread. Internally: `BindingRegistry.addRegistrationListener()`, a `SupportLoadRecorder` parameter on `getSupportCodeLibrary()`, `src/api/selective-load.ts`, `src/api/builder-fingerprint.ts` and `src/utils/module-graph.ts`.
- **Watch mode** (`--watch` / `-w`, `watch: true` in a profile, `--no-watch` to override). The CLI runs the configuration, then stays running and runs it again whenever a feature file, a support file or a project module the support code loaded changes (one non-recursive `fs.watch` per directory holding a known file, refreshed after every run, 200 ms quiet period), or when Enter is pressed; `q` or Ctrl-C quits, and the exit code is the last run's. Between runs the process keeps every module loaded except what must evaluate again: support files that registered anything on the previous run (steps, hooks, parameter types, `World`, default timeout, definition wrapper — the library is rebuilt per run, so their decorators must fire again; a file that registered nothing, such as a jsdom set-up, is kept), the changed files plus every project module that imports or requires them, new files, and any module that applies decorators without being a support file. CommonJS modules are evicted from `require.cache`; ES modules, which Node's module map cannot drop, are imported under a `?tsflow=<n>` version query appended by the in-thread esbuild `resolve` hook, so the previous instance stays in the map unreachable. The `BindingRegistry` is cleared before each rerun; the ESM resolution caches are cleared too. The load-phase progress line reports `(rerun N: A evaluated again, B kept loaded, C other modules)`, and a status line after each run gives its wall-clock time, the heap the next run starts from (after a full collection when Node runs with `--expose-gc`) and what is being watched; state a run leaves behind in a kept module (mounted components, unreset mocks) stays for the next run, so the heap figure is how a suite that does not clean up after its scenarios shows itself. Selective loading composes with it. Where the loader runs on Node's loader hooks thread (`ts-node-esm`, `ts-vue-esm`, third-party loaders, `TSFLOW_ESM_HOOKS=async`) modules cannot be reloaded in place, so each run is a fresh `cucumber-tsflow` child process with the same arguments plus `--no-watch`. On the spec workspaces a rerun takes 70–270 ms against 10–35 s for the first run. Internally: `SupportReloader` (exported from `@lynxwall/cucumber-tsflow/api`, an optional fourth `session` argument to `runCucumber`), `BindingRegistry.clear()` / `getBindingSourceFiles()` / `addRegistrationListener()`, `Callsite.rawFile`, `dependentProjectModules()` / `evictRequiredModules()` / `bumpModuleVersions()` / `versionedUrl()` in `src/utils/module-graph.ts`, `resetTimings()`, `resetTranspileCacheStats()`, `composeRecorders()`, and `src/cli/watch.ts`.
- `TSFLOW_ESM_HOOKS=async` forces every ESM loader onto `module.register()` (the loader hooks thread), for comparison against the in-thread default described below or as an escape hatch.
- **Startup progress feedback.** The CLI used to print nothing between `Running Cucumber-TsFlow in Serial mode.` and the formatter's first dot, which on a large suite is the whole transpile-and-load period. `runCucumber` now prints one append-only line per startup phase — resolving globs and plugins, transpiling and loading support files, initializing formatters and parsing feature files, and launching (BeforeAll hooks, or parallel children loading their support code) — each with a bracketed four-frame line spinner (`|` `/` `-` `\`, 130 ms per frame, whose color walks a twelve-color wheel one step every five frames, each new color sweeping across the three cells of the slot over three frames; five does not divide into the four-frame rotation, so the change drifts around the turn and realigns every twenty frames) in a fixed slot at the start of the line, a themed label, a plain-language note on what is happening (including the configured transpiler and file counts), a running count of support files loaded / feature files parsed / workers ready at the end, and, when the phase completes, a check mark in the spinner slot with the elapsed time and a summary (bindings, step definitions, hooks, scenarios) in place of the count. The line is redrawn whole on every frame and is never fitted to the terminal width: in a narrow window it wraps onto as many rows as it needs and is redrawn from its first row, using the current width to count rows, so nothing is shortened or dropped. The spinner is drawn by a `worker_threads` worker (`lib/utils/startup-progress-worker.js`) that writes through its own TTY stream on the terminal's file descriptor, so it keeps turning while the main thread is blocked in a long synchronous `import()` or `require()`; the main thread writes only the opening phase line and, at the end of a phase, waits on a shared `Atomics` signal for the worker to write the closing line before it prints anything else. Messages occupy a line directly beneath the active phase, replace one another in place and clear themselves after 8 seconds: a themed remark with the running count (`done`, `left`, `total`, `elapsed`) after 30 seconds without one, a dedicated explanation while nothing has completed yet (the first support file loads its entire import graph before it counts), and a relief message once work has been quick again for five units in a row (each within a second of the last) after a stall of 30 seconds or more — not on the first unit after the stall, which is often followed by another slow one. The spinner, counter and message line are drawn only when stdout is a TTY; on CI logs and redirected output the lines stay append-only. `TSFLOW_THEME` selects the labels: the default is the steps of making pickles (muted steel blue labels and check mark); `lotr` opts into The Lord of the Rings (gold); `off` disables the output. Internally: `getSupportCodeLibrary` accepts an `onFileLoaded` callback and `makeRuntime` / `ChildProcessAdapter` accept an `onWorkerReady` callback fired on each child's `READY`.

### Changed

- **The library compiles under TypeScript's `strict` mode.** `strict: true` is on in the build configuration, so the build reports what only the editor used to report; the 21 errors it found (an optional Gherkin document URI, optional envelope fields narrowed by a non-guard helper, `null` where `undefined` was meant, and the publish configuration's required URL and token) are fixed without a behavior change. A `typecheck` script covers the library and its unit-test program, the root `lint` script is a gate (`lint:fix` applies ESLint's fixes), ESLint's `no-undef` is off for TypeScript files because the compiler owns that check, and CI runs `typecheck` and `lint` after the build.
- **American English spelling** throughout the source (identifiers, comments, terminal-output text) and the documents. Nothing published changes name; the renamed identifiers are internal to `startup-progress.ts`.
- **A configuration error is reported once.** `loadConfiguration` and `convertConfiguration` logged each failure as `[tsflow:config]:ERROR …` before rethrowing it, so the CLI's report was a second copy; like the transpilers and the ESM loaders, they now keep their copy only under `TSFLOW_VERBOSE`.
- The parallel adapter passes the decorator mode to its child processes in `CUCUMBER_EXPERIMENTAL_DECORATORS`, the variable `setExperimentalDecorators()` writes and every transpiler reads, instead of a second `EXPERIMENTAL_DECORATORS` variable that only the worker's start-up read.
- **Feature files are parsed before the support code loads.** `runCucumber` used to load and register every support file, initialize the formatters, and only then parse and filter the features. It now parses and filters first, so a filtered run knows what it will execute before paying for the support tree (which selective loading relies on), buffers the Gherkin envelopes, and emits them once the formatters exist, after the `meta` message and before the support-code messages — the same order as before, so formatter output and report files are unchanged. The startup progress phases run in the new order (resolve, parse, load, launch): the pickling theme's parse phase is now `Making the brine` and the formatters no longer have a phase of their own.
- Per-file `logger.checkpoint` calls in the ESM resolve/load hooks, the esbuild transpilers and the Vue SFC compiler are now guarded behind `isVerbose()`, so their detail objects (including a full source-to-string conversion in `loadVue`) are no longer built when `TSFLOW_VERBOSE` is off.
- **Step scenario-context lookup is now O(1).** `MessageCollector` tracks the context of the running test case and `getStepScenarioContext()` returns it directly, instead of scanning every pickle in the run and regex-matching every step text on each step invocation. This is also a behavior change: the old scan could resolve to a _different_ scenario's context whenever a step pattern also matched text in another pickle, or find none when a tagged binding's tags did not match the running scenario. Steps now always receive the running scenario's context; the tag-scoped binding is still selected from the registry as before. Support code that depended on the previous cross-scenario resolution will see the running scenario's context instead.
- `hasMatchingStep` memoizes the compiled `RegExp` per step pattern, and `hasMatchingTags` lower-cases the tag list once per call instead of once per parser token.
- `BindingRegistry.updateSupportCodeLibrary` indexes each definition array by `cucumberKey` before back-patching callsites, replacing an O(bindings × definitions) scan with map reads.
- `TestCaseRunner` selects the before/after step hooks that apply to its pickle once in the constructor and resolves hook and step definitions through per-library id indexes, instead of re-filtering and linear-scanning the support library on every step.
- Decorators reuse one `short-uuid` translator per module instead of constructing one per binding, and `BindingRegistry.registerStepBinding` deduplicates a class's bindings through a key set instead of a linear scan.
- **`ts-node-esm` no longer walks the project tree at startup.** The `ts-node` service it creates now passes `files: false`. The option only controls whether ts-node globs the tsconfig `files`/`include` set to seed its language service, and that list is consumed only when `transpileOnly` is off; the service always runs with `transpileOnly: true`, so the recursive directory walk (paid once per process and per parallel child) was pure cost. This overrides a `"ts-node": { "files": true }` block in the consumer's tsconfig for that transpiler. `ts-vue-esm` delegates to `ts-node-maintained/esm` directly and is governed by the consumer's tsconfig as before.
- The ESM loaders compile the tsconfig `paths` alias regexes once per process instead of once per alias per loaded file, and `tsnode-loader` no longer makes a separate full-source `RegExp.test` pass before each rewrite.
- ESM extension resolution (`./foo` → `./foo.ts`, `./foo/index.ts`, …) caches its result per resolved path, including misses, so a module imported from many files is probed on disk once instead of up to fourteen `existsSync` calls per importer. `clearResolutionCaches()` is exported from `loader-utils.mjs` for any future long-lived process.
- **The esbuild ESM loaders run in-thread.** `es-node-esm` and `es-vue-esm` are attached with `module.registerHooks()` (Node 22.15 / 23.5 or later) instead of `module.register()`, so their `resolve` and `load` hooks run synchronously on the thread doing the importing. Under `module.register()` every resolve and every load of every module — support files and their whole dependency graph alike — was a `postMessage` round trip to a separate loader thread, and every load result was structured-cloned back. On Node versions without `registerHooks`, and when `TSFLOW_ESM_HOOKS=async` is set, these loaders fall back to `module.register()` unchanged; `ts-node-esm` and `ts-vue-esm` delegate to ts-node's asynchronous hooks and always use `module.register()`. Synchronous hooks also see every `require()` on the thread, so the hooks hand `require()` requests straight to Node's default loader and only act on `import`.
- **The esbuild ESM loaders no longer route TypeScript through ts-node.** `es-node-esm` and `es-vue-esm` used to hand each `.ts`/`.tsx` file to a `ts-node` service configured with esbuild as its transpiler, which wrapped the same `esbuild.transformSync` call in ts-node's module-type classification and a JSON parse / stringify / base64 round trip to attach the source map; `ts-node-maintained` itself was required as soon as the loader initialized. The `load` hook now reads the file and calls esbuild directly with `sourcemap: 'inline'`, and these two transpilers no longer load `ts-node-maintained` at all. Explicit `.ts`/`.tsx` specifiers are resolved by Node's default resolver instead of ts-node's; extensionless and tsconfig-`paths` specifiers are handled by the loader as before.
- The parallel child processes load their support code through `getSupportCodeLibrary`, the same function as the coordinator, instead of a copy of its loop; a support file that fails to import in a child is now named the same way (`Failed to import support file "<path>"`) when the loader's error cannot cross the hooks thread.
- `registerLoader()` attaches a loader on the hooks thread (`module.register()`) once per process, as it already did for in-thread hooks: a second `loadSupport()` / `reloadSupport()` / watch-mode run in the same process used to stack another copy of the loader, which every later resolve and load then passed through.
- In the `TSFLOW_TIMING` report, `esm:hooks-init`, `esm:resolve` and `esm:load` for an in-thread loader appear in the phase table of the context that registered it (`main`, `worker:<id>`); the separate `esm-hooks` scope now appears only for loaders on `module.register()`.
- **Callsite capture is lazy.** Every `@given`, `@when`, `@then` and hook decorator used to take a full stack trace and map the frame through `source-map-support` while its support file was being evaluated, which parsed each support file's source map on the load path. The decorator now captures only the raw V8 frame, with `Error.stackTraceLimit` reduced to the three frames it needs, and source-map resolution happens on the first read of `filename` or `lineNumber` — when the registry back-patches the CucumberJS definitions after loading, or when an ambiguity error needs a location. `BindingRegistry` identifies duplicate registrations by the raw position (file, line and column in the code that ran) instead of the mapped file and line, so registration does not force resolution either. Reported `uri`/`line` values are unchanged.
- **Callsite resolution no longer issues a synchronous XMLHttpRequest per support file under jsdom.** `source-map-support` treats a process with `window` and `XMLHttpRequest` globals as a browser and fetches each source file over a synchronous XHR before reading it from disk; jsdom services that request by spawning a process, so every support file cost several hundred milliseconds at load time in any jsdom-based (Vue) suite — about 20 s of a 24 s startup on a 34-file profile, previously misread as module evaluation time. The lookup now runs with the `XMLHttpRequest` global hidden for its (synchronous) duration, which keeps the library on its file-system path.
- Callsite filenames are made relative to the working directory on every platform. The previous code recognized only a Windows path separator, so on Linux and macOS the step-definition `uri` in reports and messages was an absolute path.
- Parallel child processes no longer re-run the support-file glob. The coordinator resolves the `require`/`import` globs once and sends the resolved lists in the `INITIALIZE` command (`resolvedSupportPaths`); previously a `parallel: N` run expanded the globs N+1 times. The command's message data no longer carries the sources `coordinates`, which no child has read since callsite resolution stopped depending on them.
- The package root no longer loads the CLI when imported. The deprecated `Cli` export constructs the real class on first use, so `import { binding } from '@lynxwall/cucumber-tsflow'` pulls in 540 modules instead of 593 — `runCucumber`, `makeRuntime`, the parallel adapter, `commander`, `ansis` and `debug` leave the decorator load path. `new Cli(...).run()` works as before; `instanceof Cli` against the exported symbol does not.
- `binding-decorator.ts` takes `Given`, `When`, `Before`, … from `supportCodeLibraryBuilder.methods` (the same functions `@cucumber/cucumber` re-exports) instead of importing the `@cucumber/cucumber` root barrel, which is what keeps the `bindings` entry point small.

### Fixed

- **`reloadSupport()` builds a complete library and forgets the previous load's bindings.** With a non-empty `changedPaths` it evicted only the changed files and their support-file dependents from `require.cache`, so every unchanged support file stayed cached, evaluated nothing on the reload and was missing from the library it returned; a changed helper's intermediate dependents (a module between the helper and the support file) were not evicted either, so a re-evaluated file could pick up the old helper; ES modules were never reloaded at all; and the `BindingRegistry` kept the previous evaluation's bindings, so a re-evaluated class's steps were shadowed by the old class's under the same pattern. Loading now goes through one implementation for every context (`getSupportCodeLibrary`): every load starts from an empty registry and builder, and a load after the first in a process makes its modules evaluate again before it starts, evicting CommonJS modules from `require.cache`, versioning ES modules (the `?tsflow=<n>` query watch mode already used) and running the reload listeners. By default that is every support file being loaded; `reloadSupport` adds the changed modules and every project module that depends on one of them (`dependentProjectModules()`), and watch mode passes the smaller set its `SupportReloader` decides. `loadSupport` and `reloadSupport` also now honor the `experimentalDecorators` option they always declared, recording the decorator mode for the process before anything loads. A load replaces the process's bindings, so calling the API from inside a running suite is not supported; the reload-support spec now drives it in a child process, the way a persistent worker does. Under `es-node-esm` and `es-vue-esm` the location of a `@given`/`@when`/`@then` or hook in reports, messages and ambiguity errors was the line in esbuild's transpiled output and the module's `file:` URL: the transpiled code (with its inline map) exists only in memory, so `source-map-support`, which reads the file on disk, found no map for it. The `load` hook now keeps each module's source map (`sourcemap: 'both'`) on the thread that will resolve callsites, and `Callsite` traces positions through it with `@jridgewell/trace-mapping` (new dependency) before falling back to `source-map-support`. When the esbuild loaders run on Node's loader hooks thread instead (`TSFLOW_ESM_HOOKS=async`, or a Node without `module.registerHooks()`), they relay each module's map to the main thread over a `MessagePort` before returning the module's source, so the same lines are reported under both hook modes. The ts-node ESM loaders are unchanged.
- **Quitting a `--watch` session whose last run failed to load its support code** ended the process with a `TypeError` stack after `Watch mode stopped.` and exit code 1. The CLI read the message collector, which is created only once the support code has loaded, to choose between exit codes 2 and 3; the read is now guarded and the process exits with 2, as after any failed run.
- **A `BeforeAll` or `AfterAll` hook that throws now fails the run**, as it does in CucumberJS. The hook's error used to be caught into a result nobody read: nothing was printed, no `testRunHookStarted` / `testRunHookFinished` envelope was emitted, every scenario ran, and the CLI exited 2 under a passing summary. Test-run hooks now emit both envelopes, run under their timeout and in the test-run scope (so the `context` proxy works inside them), and one that throws ends the run with `a BeforeAll hook errored, process exiting: <uri>:<line>` carrying the hook's error as its cause: exit code 1 in serial mode; in parallel mode the worker reports it and exits, and the run fails.
- **A support file that fails to load is reported once.** esbuild printed its own diagnostic to stderr from inside `transformSync` (over the open progress line), the ESM loaders logged the error before rethrowing it, and the CLI logged it again at each of two levels, so a syntax error or a missing import showed up three to five times. The esbuild transpilers now run with `logLevel: 'silent'`, the loaders keep their copy only under `TSFLOW_VERBOSE`, and the CLI reports the error once after the load phase line has closed: the error and its causes one per line (a cause whose message the level above already embeds is not repeated), with stacks under `TSFLOW_VERBOSE`. Watch mode reports a failed run the same way instead of printing the stack.
- **Load errors from the `ts-node-esm` loader name the file again.** An error thrown on Node's loader hooks thread reaches the main thread by structured clone, which keeps only genuine `Error` instances; ts-node's `TSError` is built without calling `Error`, so a TypeScript diagnostic arrived as an empty object and the CLI printed `undefined: undefined`. The loader now rebuilds such a value as a plain `Error` carrying the diagnostic, the stack and the module URL. When a loader the project configures directly (`ts-node-maintained/esm`) hits the same limit, the CLI names the support file it was importing instead of the empty value. Note that a directly configured `ts-node-maintained/esm` loader (and `ts-vue-esm`, which delegates to it) is governed by the project's tsconfig and type-checks unless `ts-node.transpileOnly` or `TS_NODE_TRANSPILE_ONLY=true` says otherwise, while the `ts-node`, `ts-vue` and `ts-node-esm` transpilers tsflow configures are always transpile-only.
- **A startup phase that ends in failure closes with a failure mark.** The load phase of a run whose support code did not load (and the launch phase when a `BeforeAll` hook throws) used to close with the theme's check mark on a terminal, `[ ✓ ] … failed, 350ms`. The spinner slot now shows `[ ✗ ]` in a muted red instead; on a non-TTY stream the closing text ` failed, <elapsed>` is unchanged. Internally: `StartupProgress.fail()`.
- **Output from a `BeforeAll` hook no longer lands on the launch phase line.** In serial mode the launch phase used to stay open while the hooks ran, so anything a hook printed was appended to the phase line (`running BeforeAll hooksbeforeAll was called`) and, on a terminal, erased by the next redraw. The phase now reads `assembling N test cases` and closes before the first `BeforeAll` hook runs; on a parallel run it still spans the workers loading the support code, and output from a hook running inside a worker can still land on it.
- **The watch-mode and selective-load notices name the loader the way the load phase does.** When a loader runs on Node's loader hooks thread (`TSFLOW_ESM_HOOKS=async`, `ts-node-esm`, `ts-vue-esm`), the notice explaining why the support code cannot be kept loaded, or why selective loading is unavailable, named it by its module specifier (`the @lynxwall/cucumber-tsflow/lib/transpilers/esm/esnode-loader loader …`). It now says `the es-node-esm loader …`, falling back to the specifier for a loader that is not one of the built-in transpilers.
- Selective loading keyed a regular-expression step pattern without flags and a Cucumber-expression pattern with the same text under one entry, so whichever a support file registered second was matched with the other's compiled expression and its file could be skipped although a selected step matched it. The two are now distinct keys.
- The ES module entry points (`@lynxwall/cucumber-tsflow` and `@lynxwall/cucumber-tsflow/bindings` when imported from ESM) no longer export `StartTestCaseInfo`, `EndTestCaseInfo` and `ScenarioContext` as runtime values. They are TypeScript interfaces and their values were `undefined`; the types are unchanged and `import type` of them works as before.

### Deprecated

- **`parallelLoad` / `--parallel-load`.** Still accepted, so existing configurations and scripts keep working, but ignored. A run that sets it prints a deprecation notice naming the configuration file (or the command-line flag) to remove it from. The option will be removed in the next major version.

### Removed

- `import-sync` and `tslib` from the package's dependencies. Neither is imported anywhere in the library; `tslib` would only be needed with `importHelpers`, which the build does not use.
- `BindingRegistry.removeBindingsForFile()` and `hasBindingForKey()` (internal, reachable only through the `lib/*` wildcard export), written for the delta-aware reload that the one-implementation reload replaced and called nowhere since; and `TranspileOptions.debug`, declared and defaulted but read nowhere.
- **Parallel preload of support files** (the `parallelLoad` worker threads, the `Making the brine` / `Stoking the forges` startup phase, and the `preload:<n>` sections of the `TSFLOW_TIMING` report). Measured on a 334-scenario Vue suite with the on-disk transpile cache in place, the phase cost 5–6 s on every run and saved at most 1.8 s, and only on a cold cache: its worker threads had to evaluate every support module and its dependency graph — the part of loading that cannot be moved off the main thread — to reach the transpile step, then the main thread evaluated it all again. The transpile cache delivers the durable part of what the preload promised. Removed with it: `loader-worker.ts` and its 160-line browser `window` shim, `parallel-loader.ts`, `SerializableBindingDescriptor` / `serializeBinding`, `BindingRegistry.toDescriptors()` / `getDescriptorSourceFiles()`, and the `global.__LOADER_WORKER` flag.
- Dead `cucumber-tsflow-specs` path check in the ESM `esbuild.mjs` `supports()` export, which would have disabled transpilation for every consumer project had anything called it.
- The `TS_NODE_FILES=true` environment assignments in the esbuild loaders' ts-node service module and `vue-loader.mjs`. Both ran after `ts-node-maintained` had already been required (and had already read its environment defaults) at module initialization, so they had no effect.
- `tsnode-service.mjs` (internal; it existed only to build the `ts-node` service the esbuild ESM loaders no longer use), the `getEsmHooks` / `createHookExports` helpers and the `tsNodeHooks` / `getTsNodeHooks` / `handleTsFiles` options of `resolveSpecifier` in `loader-utils.mjs`, and the `getFormat` / `transformSource` exports of `esnode-loader` and `esvue-loader` — legacy hook names that Node has not called since 16.12.
- **`@lynxwall/cucumber-tsflow/lib/transpilers/esm/esbuild-transpiler`** (the ESM-emitting ts-node `Transpiler` plugin), its bundled `lib/transpilers/esm/esbuild-transpiler-cjs.js` and the `build:transpiler` build step. The plugin existed so the esbuild ESM loaders could route TypeScript through a ts-node service; with that path gone it had no caller. The CJS plugin `@lynxwall/cucumber-tsflow/lib/transpilers/esbuild-transpiler`, used by `es-node` and `es-vue`, is unchanged. Consumers who pointed their own `ts-node/esm` configuration at the removed export should use `es-node-esm` or `es-vue-esm` instead.

## [7.7.2]

### Fixed

- **Comprehensive browser shims in parallel loader worker** — replaced the minimal `window = globalThis` shim with full stubs for `location`, `document`, `navigator`, `localStorage`, `matchMedia`, `XMLSerializer`, `HTMLElement`, `Element`, and other browser globals. Aligned with the environment setup used by `@uis/testing-bdd` (uis-jest). Prevents `Cannot read properties of undefined (reading 'prototype')`, `Cannot read properties of undefined (reading 'href')`, and similar errors when libraries probe for browser APIs during module evaluation in worker threads.
- **Getter-only global properties** — `globalThis.navigator` (and other properties) are getter-only in modern Node.js (v21+). Replaced direct assignment with `Object.defineProperty` via a `safeDefine` helper to avoid `Cannot set property navigator of #<Object> which has only a getter` errors.
- **Per-file error isolation in loader worker** — each support-code file is now loaded inside its own `try/catch`. A single file failing no longer kills the entire worker; other files still warm the transpiler cache successfully. Failed files are reported as non-fatal `fileErrors` and loaded by the main thread as a fallback.
- **ESM loader registration order** — moved `register()` calls for ESM loaders before the ESM file import phase (was previously after CJS loads), ensuring loaders are active when `import()` is called.

### Changed

- **`LoaderWorkerResponse` type** — added optional `fileErrors` field to report per-file load failures without treating the entire worker as failed.
- **Parallel loader result reporting** — workers that complete with some file errors now report `LOADED` (not `ERROR`). Per-file errors are logged as informational checkpoints, not `ERROR` level. Added summary message for skipped files.

## [7.7.1]

### Fixed

- **`window` shim in parallel loader worker** — worker threads now shim `globalThis.window` before loading any support-code files, preventing `window is not defined` errors thrown by libraries that assume a browser environment at import time.

### Removed

- Unused imports: `defineParameterType` from `binding-decorator.ts`, `supportCodeLibraryBuilder` from `run-cucumber.ts`, `addStepBinding` from `step-decorators.ts`, `timestamp` from `worker.ts`.

## [7.7.0]

### Added

- **Parallel preload** (`parallelLoad` configuration option) — warms transpiler on-disk caches in parallel `worker_threads` before the main support-code load phase. Each worker loads a subset of support files (round-robin distribution), triggering transpilation and populating the filesystem cache. The main thread's subsequent load (and any parallel child processes) then hit warm caches, significantly reducing startup time for large projects. Set `parallelLoad: true` for automatic thread count or provide an explicit number.
- `Architecture.md` document describing the project's architectural design, execution flow, and component relationships.

### Fixed

- **`throw error()` bug in `test-case-runner.ts`** — four instances used `console.error()` (which returns `void`) instead of `new Error()`, meaning thrown errors were always `undefined`.
- **Broken `escapeRegExp` in `runtime/utils.ts`** — the function was a no-op (`'$&'` preserves the original character) and double-processed intentionally constructed regex syntax from `getRegTextForStep`. Removed entirely.
- **Missing hook failure checks in serial adapter** — `runBeforeAllHooks()` and `runAfterAllHooks()` return values were ignored. Added `hasHookFailure()` helper and failure propagation.
- **Package exports typo** — trailing apostrophe on the `esbuild-transpiler` export key.
- **Misspelled folder name** — renamed `step-definition-snippit-syntax` to `step-definition-snippet-syntax` (source and compiled output) and updated all import references.

### Changed

- **Replaced `underscore` with native methods** — removed all `_.map()`, `_.flatten()`, and `_.filter()` calls in `binding-registry.ts`, `binding-decorator.ts`, and `managed-scenario-context.ts` in favor of native `Array.prototype` equivalents (`map`, `flatMap`, `filter`).
- **O(1) binding lookup** — added `_cucumberKeyIndex` Map to `BindingRegistry` for constant-time `getStepBindingByCucumberKey()` and `hasBindingForKey()` lookups, replacing linear scans.
- **Collapsed `updateSupportCodeLibrary` switch** — replaced a 9-case `switch` statement with a lookup map that maps `StepBindingFlags` values to their corresponding `SupportCodeLibrary` array names.
- **Simplified constructor injection** — replaced a 10-case `switch` in `ManagedScenarioContext.invokeBindingConstructor()` with a single spread call (`new ctor(...args)`).
- **Extracted `replaceFormatAlias` helper** — deduplicated two identical format-replacement loops in `load-configuration.ts` into one shared function.

### Removed

- `underscore` runtime dependency and `@types/underscore` dev dependency.
- Empty `src/support_code_library_builder/` directory (dead scaffolding; all imports reference the `@cucumber/cucumber` vendor package).
- Legacy `tslint:disable` comments in `binding-registry.ts` and `types.ts`.

## [7.6.0]

### Added

- New `reloadSupport` API function that performs an incremental reload of the `ISupportCodeLibrary`. Evicts only the changed files (and their dependents) from Node's `require.cache`, then re-requires all support files. Unchanged files resolve instantly from cache; only changed files pay the transpilation and evaluation cost. This is intended for use by persistent worker processes (e.g. the `cucumber-tsflow-vscode` VS Code extension) to keep workers warm between test runs.

### Changed

- Consolidated the Vue SFC compiler into a single shared implementation (`vue-sfc-compiler.ts`). The previous CJS path used a Vite-plugin-derived implementation spread across 9 files (`vue-sfc/` directory); it is now replaced by one shared function that both the CJS transpilers and ESM loaders delegate to. The `format` option (`'cjs' | 'esm'`) controls the esbuild output format, keeping identical runtime behavior across all transpiler configurations.
- Disabled `transformAssetUrls` in `compileTemplate` and `compileScript` to prevent binary asset files (e.g. `.jpg`) from being rewritten into `import`/`require` calls. Unit tests do not need asset URL resolution; leaving asset `src` attributes as literal strings is the correct behavior when mounting components with `@vue/test-utils`.

### Fixed

- **Duplicate "Using Experimental Decorators." console message** — the message was logged once in `load-configuration.ts` and again in `run-cucumber.ts`. The duplicate in `load-configuration.ts` has been removed.

### Removed

- `rollup` runtime dependency — was only used by the now-deleted `vue-sfc/types.ts` for `RollupError`/`RollupLog` types.
- `@rollup/pluginutils` dev dependency — was only used by the now-deleted `vue-sfc/index.ts` for `createFilter`.

## [7.5.5]

### Fixed

- Copilot fixed package.json URL to match repo so that publishing checks would pass.

## [7.5.4]

### Fixed

- Added --province flag and NPM Token based on copilot feedback.

## [7.5.3]

### Fixed

- Updated publish.yml because Trusted publisher only works with Node 24+.

## [7.5.2]

### Added

- Added publish.yml GitHub workflow action, which was required by deprecation of token keys.

## [7.5.1]

### Changed

- Add conditionally logging via ENV var TSFLOW_VERBOSE=true

## [7.5.0]

### Changed

- Switched @cucumber/cucumber back to a dependency since Cucumber-TsFlow includes most of the same exports as @cucumber/cucumber with many of them overridden.

### Fixed

- Add format: module to all load paths for esm loaders to resolve an issue where the loaders would default back to cjs.

## [7.4.1]

### Fixed

- Moved initialization of the Boolean parameter type from the binding decorator to support code library initialization code. Attempting to resolve context issues when running in the VS Code extension.

## [7.4.0]

### Changed

- Switched @cucumber/cucumber to a peerDependency to avoid runtime instance conflicts when using cucumber-tsflow from the companion VS Code extension.

## [7.3.4]

### Fixed

- Fix calling defineParameterType to use supportCodeLibraryBuilder instance instead of the exported defineParameterType function. The exported function can be bound to a different supportCodeLibraryBuilder instance and causes errors when used.

## [7.3.3]

### Fixed

- Fix reference to defineParameterType import in binding-decorator.ts. Needs to use supportCodeLibrary instance that's exported from index.ts.

## [7.3.2]

### Fixed

- Fix ESM loaders to properly handle JSON imports with required import attributes

## [7.3.1]

### Fixed

- Fix ESM loader to properly resolve TypeScript path aliases (e.g., `@fixtures/*`) in Vue Single File Components and add automatic extension resolution (.ts, .js, .mjs, .vue)

## [7.3.0]

### Added

- Transpilers for ESM projects. Read more about the [cucumber-tsflow ESM implementation](https://github.com/LynxWall/cucumber-js-tsflow/blob/master/cucumber-tsflow/src/transpilers/esm/README.md).

### Changed

- Upgraded to Cucumber-JS 12.2.0
- Upgraded to Typescript 5.9.2

### Fixed

- Deprecated warnings with Node 22+ and ts-node 10.9.2. Upgraded to [ts-node-maintained](https://github.com/thetutlage/ts-node-maintained) v10.9.6, which resolves the fs.Stats warning and fixes a couple of other bugs.

## [7.2.0]

### Fixed

- Issue with passing a test file on command line throwing invalid args error. Was caused by upgrading Commander. Backed down to version used by Cucumber-JS.

### Changed

- Upgraded to Cucumber-JS 11.3.0
- Implemented support for Experimental Decorators using a new configuration flag named experimentalDecorators. When true Experimental Decorators will be supported. When false TypeScript 5.x Official Decorators will be used.
- Added class-validator tests. Class-validator is a decorator based validation utility that uses experimental decorators and the main reason for adding support for them.
- Doubled the number of tests to cover Official and Experimental Decorators with all tests.

## [7.1.2]

### Fixed

- Removed unused packages from the library.

## [7.1.1]

### Changed

- Moved ts-node dependencies: @types/node and typescript from devDependencies to dependencies. These are used by the transpilers when running tests.

## [7.1.0]

### Changed

- Removed peerDependency on cucumber-js. Emphasizing that cucumber-tsflow extends cucumber-js and would be used in-place-of, not along-side cucumber-js.
- Updated exports to include most of the User exports from cucumber-js along with cucumber-tsflow exports that extend or override cucumber-js.
- Code Refactoring: Moved non-d.ts types closer to usage, some reorganization of code.

## [7.0.0]

### Added

- API Support that implements and extends the cucumber-js API to support cucumber-tsflow bindings.

### Changed

- Upgraded to cucumber.js 11.2.0, which has several [breaking changes](https://github.com/cucumber/cucumber-js/blob/main/CHANGELOG.md) since the last tsflow release.
- Update to latest Node 22 LTS release
- Switched from experimental decorators in Typescript to official decorators published in Typescript 5.2.
- Upgraded packages to latest stable versions
- Updated transpiler configurations.
- Added exports to package.json.

## [6.5.7]

### Fixed

- Added StartTestCaseInfo and EndTestCaseInfo back to main exports.

## [6.5.6]

### Fixed

- Another move of TestCaseInfo exports to attempt fixing issues with imports into other projects.

## [6.5.5]

### Fixed

- Moved StartTestCaseInfo and EndTestCaseInfo to a separate type file with limited message imports. Attempting to mitigate type issues during test run that uses new interface types.

## [6.5.4]

### Fixed

- Moved StartTestCaseInfo and EndTestCaseInfo to the message-collector due to type import issues.

## [6.5.3]

### Fixed

- Moved ContextType back into types.ts to fix type declaration issues.

## [6.5.2]

### Added

- New argument: { pickle, gherkinDocument, testCaseStartedId } : StartTestCaseInfo is now passed to the initialize function of an injected context.
- New argument: { pickle, gherkinDocument, result, willBeRetried, testCaseStartedId } : EndTestCaseInfo is now passed to the dispose function of an injected context.
- StartTestCaseInfo and EndTestCaseInfo interfaces are exported from @lynxwall/cucumber-tsflow

## [6.5.1]

### Fixed

- Fixed support for Context initialization when not using parallel configuration settings.

## [6.5.0]

### Changed

- Added initialization support for Context types injected into a binding using Context Injection.

## [6.4.0]

### Changed

- Context objects used with Context Injection can now define a constructor that takes a World object parameter. ex: `constructor(worldObj: World)`

## [6.3.0]

### Changed

- Disabled the loading of `<style>` blocks when compiling Vue SFC components.

### Added

- New configuration setting named `enableVueStyle` that allows users to enable the loading of Vue `<style>` blocks when testing against compiled library components.

## [6.2.4]

### Fixed

- Updated JSDom which removes deprecation warnings for abab and domexception packages

## [6.2.3]

### Fixed

- Junit bamboo formatter putting failure nodes in pending and undefined tests

## [6.2.2]

### Added

- Junit bamboo formatter to output junit xml test results that categorize pending and undefined tests as skipped instead of failing

## [6.2.1]

### Fixed

- Added commander@10.0.1 as a dependency to resolve issues with older versions being used based on other dependencies.

## [6.2.0]

### Changed

- Exit code changes: 1=invalid configuration or unhandled exception when executing tests, 2=implemented tests passing but there are pending, undefined or unknown scenario steps, 3=implemented tests failing.
- Upgraded to cucumber.js 9.6.0, which is the last 9.x version before version 10.x.
- Upgraded to Typescript 5.2.x
- Removed deprecated shouldAdvertisePublish config setting and cli return value.

## [6.1.1]

### Fixed

- Execution and debugging of step files associated with multiple feature files.

### Changed

- Upgraded to cucumber.js 9.1.2.
- Performance improvements when matching a step file to features.

## [6.1.0]

### Fixed

- Execution and debugging of individual feature files that only contained Scenario Outlines.

### Added

- Scenario Outline tests.

## [6.0.2]

### Fixed

- Tagged wrong branch

## [6.0.1]

### Changed

- Upgraded yarn package manager to version 3.5.0

## [6.0.0]

### Added

- New exit code to differentiate between a test run that has failures and one that just has pending or undefined scenario steps. The original implementation only had two exit codes: 0 and 1. This update adds an extra exit code and changes the meaning of exit code 1. New exit codes are: 0 = all scenarios passing, 1 = implemented scenarios are passing but there are pending, undefined or unknown scenario steps, 2 = one or more scenario steps have failed.
- Background test example.
- Tests using all four transpires

### Changed

- Upgraded to cucumber.js 9.1.0, which has [breaking changes](https://github.com/cucumber/cucumber-js/blob/main/CHANGELOG.md#900---2023-02-27) that were implemented in version 9.0.0.
- Upgraded packages to latest stable versions
- Locked package versions being used to Major/Minor
- Updated esvue and esnode transpiler configurations to use es module (es2022) for transpilation instead of CommonJS.

## [5.1.3]

### Fixed

- Asset handling in Vue components causing transform failures. Since this is only used for Vue components loaded in Vue/test-utils, the **_transformAssetUrls_** option will be set to **false** by default. As a result, any Vue components with media assets will load without attempting to transform the asset.

## [5.1.2]

### Fixed

- Update to command line execution in README to use npx command.

## [5.1.1]

### Fixed

- Bug loading configuration files that was introduced with the latest update of Cucumber.js to version 8.6.0. Underlying cucumber libraries added a logging parameter to the beginning of several functions
  used by cucumber-tsflow.

### Changed

- Upgraded to Cucumber.js 8.6.0 and locked the reference to the current major.minor version. This should prevent breaking changes from Cucumber.js breaking cucumber-tsflow.
- Upgraded other packages to latest stable versions
- Updated tests to add the Cucumber.js World object to an injected context object.

### Added

- Example on how to access the Cucumber.js World object to README

## [5.1.0]

### Fixed

- Fixed support for Parallel execution of tests.

### Changed

- Upgraded to cucumber.js 8.5.0
- Upgraded jsdom to latest version
- Upgraded other packages to latest stable versions

## [5.0.8]

### Fixed

- Removed slash import because some packages (Histoire) install latest esm only version. Replaced with code from slash package and added original author to MIT License.

## [5.0.7]

### Changed

- Switched to commonjs build instead of umd
- Package updates to latest version
- Removed callsites and implemented internally. Latest version of callsites is esm only, which doesn't work with tests.

### Fixed

- Hook examples in README

## [5.0.6]

### Changed

- README updates to specify that cucumber-tsflow command should be used for test execution.

### Added

- Examples and information to README

## [5.0.5]

### Fixed

- Issue with boolean parameter being added too early. Needs to be added once when code is transpiled.

### Added

- Boolean type tests

## [5.0.4]

### Fixed

- missing dependency short-uuid (had been added as devDependency)

### Added

- Note about only needing @cucumber/cucumber installed if using cucumber-js to execute tests instead of cucumber-tsflow

## [5.0.3]

### Fixed

- Line endings in bin/cucumber-tsflow to fix test issue in GitHub

## [5.0.2]

### Fixed

- README links
- Removed Vue dependency

## [5.0.1]

### Changed

- Removed ManagedScenarioContext from World object along with Before and After hooks used to manage it.

### Added

- Transpiler support using typescript or esbuild
- Vue transform support based on the vite/vue-plugin
- Cucumber message collector to manage the ManagedScenarioContext object
- RegEx matcher to match step expressions with feature step text. Supports all cucumber expressions along with regular expressions.
- BeforeStep and AfterStep hooks from cucumber with tests

### Fixed

- Parameter definitions for different hook functions to be consistent with cucumber
- Step tags to support same functionality as Cucumber hook tags

## [5.0.0]

### Changed

- BREAKING CHANGE! Renamed JavaScript components used for ts-node and Vue initialization along with snippet and behave formatters.
- Updated to @cucumber/cucumber version 8.0.0

### Added

- Implemented CLI and Cucumber Test runner in cucumber-tsflow using cucumber API and libraries
- Extended cucumber options to add environment (node or vue) and debugFile support
- Cucumber code library update so that summary and reports provide file name and line number of actual test and not location of binding in cucumber-tsflow
- Added support to dubg individual features associated with step file open in editor
- Boolean type for cucumber expressions
- behave tag support for formatter options used to generate json report compatible with Behave-Pro

### Fixed

- various Bugs

## [4.1.7]

### Changed

- Switched from happy-dom to jsdom because emitted events weren't bubbling up from dependent Vue components. Switching to jsdom fixed the issue.

## [4.1.5]

### Changed

- Vue transpiler updates

## [4.1.3]

### Changed

- Workflow and config updates

## [4.1.2]

### Added

- Support for transpiling Vue3 files in cucumber tests
- JavaScript scripts to initialize ts-node for stand-alone node execution or Vue3 execution with happy-dom
- Tests for Vue3 support
- Initial stub for cucumber-tsflow execution from node_modules/.bin

## [4.1.0]

### Added

- behave-json-formatter that fixes json so it can be used with Behave Pro
- tsflow-snippet-syntax used to format snippet examples
- BeforeAll and AfterAll Hooks
- WrapperOptions in step definitions
- Timeout in step definition and hooks

### Changed

- project restructure
- using version 8.0.0-rc.3 of @cucumber/cucumber

### Fixed

- Bugs related to tags

## [4.0.0]

Initial fork from [cucumber-tsflow](https://github.com/timjroberts/cucumber-js-tsflow)
