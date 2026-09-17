# Architecture

`@lynxwall/cucumber-tsflow` wraps and extends CucumberJS, providing SpecFlow-like TypeScript decorator bindings. Users author class-based step definitions decorated with `@binding()`, `@given()`, `@when()`, `@then()`, `@before()`, `@after()`, etc. instead of using CucumberJS's functional API.

## Layers

All source code lives under `cucumber-tsflow/src/`.

| Layer | Directory | Purpose |
| --- | --- | --- |
| CLI | `src/cli/` | Command-line entry point, argv parsing, orchestrates configuration and execution |
| API | `src/api/` | Programmatic API: `loadConfiguration`, `loadSupport`, `runCucumber` |
| Runtime | `src/runtime/` | Serial and parallel execution, test case runner, worker, coordinator, context management, message collector |
| Bindings | `src/bindings/` | Decorator registration, singleton binding registry, step binding types |
| Formatters | `src/formatter/` | Custom formatters: Behave JSON, JUnit Bamboo, TsFlow snippet syntax |
| Gherkin | `src/gherkin/` | Feature file parsing and debug-file matching |
| Transpilers | `src/transpilers/` | CJS and ESM transpiler backends: esbuild, ts-node, Vue SFC compiler |
| Types | `src/types/` | Global type augmentations |
| Utils | `src/utils/` | Logging, helpers, callsite capture |

## Execution Flow

```
CLI → loadConfiguration() → runCucumber() → load support code → makeRuntime() → Coordinator + Adapter → Worker → TestCaseRunner
```

1. The CLI parses arguments and loads configuration (profiles, transpiler selection, decorator mode)
1. Support code is loaded: transpilers are registered, step definition files are imported, and decorator side-effects populate the `BindingRegistry`
1. `makeRuntime()` creates a `Coordinator` with either an in-process (serial) or child-process (parallel) adapter
1. The coordinator assembles test cases from parsed Gherkin pickles and delegates execution to the adapter
1. Each test case runs through `TestCaseRunner`, which resolves bindings and manages scenario context

## Bindings System

The bindings system maps TypeScript decorators to CucumberJS step and hook definitions.

### Key Files

- `binding-decorator.ts` — the `@binding()` class decorator; detects decorator mode and registers all collected bindings
- `binding-registry.ts` — singleton registry (`BindingRegistry.instance`) stored on `global.__CUCUMBER_TSFLOW_BINDINGREGISTRY`
- `step-binding.ts` — `StepBinding` interface
- `step-decorators.ts` — `@given()`, `@when()`, `@then()` method decorators
- `hook-decorators.ts` — `@before()`, `@after()`, `@beforeAll()`, `@afterAll()`, `@beforeStep()`, `@afterStep()` decorators
- `binding-context.ts` — storage mechanisms for buffering bindings during decoration
- `types.ts` — `StepBindingFlags` bitfield enum and `ContextType` interface

### Registration Flow

1. Method decorators (`@given()`, `@when()`, etc.) create `StepBinding` objects and buffer them in a context-appropriate store. Each captures a `Callsite` holding only the raw V8 stack frame of the decorated line (`Error.stackTraceLimit` is lowered to the three frames needed); mapping that frame through a source map is deferred to the first read of `callsite.filename`/`lineNumber`, so no source map is parsed while support files are evaluating
1. The `@binding()` class decorator runs last (class decorators execute after method decorators)
1. It reads all buffered bindings, sets `classPrototype`, and registers them in `BindingRegistry`
1. Each binding is then registered with CucumberJS (`Given()`, `Before()`, etc.) via a trampoline function; these are taken from `supportCodeLibraryBuilder.methods` rather than the `@cucumber/cucumber` root barrel so that a support file's import graph stays small
1. At runtime the trampoline resolves the correct class instance through `ManagedScenarioContext`

### Registry Internals

The `BindingRegistry` maintains three primary indexes:

- `_stepBindings`: `Map<StepPattern, Map<TagName, StepBinding[]>>` — indexed by pattern then tag
- `_classBindings`: `Map<prototype, ClassBinding>` — per-class bindings and context types
- `_cucumberKeyIndex`: `Map<string, StepBinding>` — O(1) lookup by generated `cucumberKey`

Duplicate registrations (a file re-evaluated by `reloadSupport()`, for example) are detected with a key built from `callsite.rawPosition` (file, line and column of the executed code), tags and pattern, so registering a binding never triggers source-map resolution.

`updateSupportCodeLibrary()` patches CucumberJS's `SupportCodeLibrary` with tsflow-specific metadata (timeouts, tags, binding references) so that the runtime can resolve back to the correct decorator-based definitions. Reading `callsite.filename`/`lineNumber` here, once per binding after all support code has loaded, is where source maps are actually consulted. A frame whose file name is a `file:` URL is first looked up in `globalThis.__CUCUMBER_TSFLOW_SOURCE_MAPS`, where the esbuild ESM `load` hook keeps the source map of every module it transpiled on the thread (the transpiled code exists only in memory, so nothing that reads the file on disk can map it); the position is traced with `@jridgewell/trace-mapping`, one decoded `TraceMap` per module, and the filename is the URL's path. Everything else, and any URL the hook did not record (the ts-node loaders, or the esbuild loaders on the `module.register()` hooks thread), goes through `source-map-support`. That lookup runs with the `XMLHttpRequest` global hidden: `source-map-support` treats a process with `window` and `XMLHttpRequest` globals (any jsdom set-up) as a browser and fetches each source file with a synchronous XHR that jsdom services by spawning a process, several hundred milliseconds per support file.

## Runtime System

### Coordinator

`Coordinator` implements the CucumberJS `Runtime` interface. It assembles test cases from sourced pickles, delegates to an adapter (serial or parallel), and emits `testRunStarted`/`testRunFinished` envelopes.

### Serial Execution

`InProcessAdapter` creates a single `Worker` and runs all test cases sequentially in-process.

### Parallel Execution

Parallel execution uses Node.js child processes:

- `ChildProcessAdapter` forks child processes via `child_process.fork()`, manages worker lifecycle, and distributes test cases over IPC (`INITIALIZE`/`RUN`/`FINALIZE` commands). `INITIALIZE` carries the coordinator's already-resolved `requirePaths`/`importPaths` (`resolvedSupportPaths`) alongside the original coordinates, so children do not expand the support globs again
- `ChildProcessWorker` runs inside each forked process: loads support code from those paths (re-running transpiler registration and decorators), creates its own `MessageCollector`, and executes tests via `Worker`
- `run-worker.ts` is the entry point script forked by the adapter

### Test Case Execution

`TestCaseRunner` runs a single scenario: creates a `World` instance, handles retries, runs before/after hooks, and executes step definitions. It uses `BindingRegistry.instance` to resolve tsflow bindings at each step.

### Message Collector

`MessageCollector` extends CucumberJS's `EventDataCollector` and listens to `envelope` events. It is stored as `global.messageCollector` and provides:

- `getStepScenarioContext()` — returns the `ManagedScenarioContext` of the test case currently running in this process (tracked from `testCaseStarted` to `endTestCase`)
- `getHookScenarioContext()` — retrieves context for hook execution
- `startTestCase()` — creates a new `ManagedScenarioContext` for each test case

## Dependency Injection / Context Management

The DI system provides per-scenario object lifetime management through `ManagedScenarioContext`.

### How It Works

1. `@binding([ContextClass1, ContextClass2])` declares context types required by a step definition class
1. At runtime, when a step executes, `ManagedScenarioContext.getOrActivateBindingClass()` is called
1. Context instances are created (one per type per scenario) via `new ContextType(worldObj)` — receiving the CucumberJS `World` in the constructor
1. The binding class instance is created via `new BindingClass(...contextObjects)` — context objects injected through the constructor
1. Both are cached in an internal map keyed by prototype (singleton per scenario)
1. Context objects with an `initialize()` method are called once at scenario start
1. All active objects with a `dispose()` method are called at scenario end

### Usage Pattern

```ts
// Context class — one instance per scenario
export class MyContext {
   public someValue = '';
}

// Step definition class — receives context via constructor
@binding([MyContext])
export default class MySteps {
   constructor(private context: MyContext) {}

   @given('a value of {string}')
   setvalue(value: string): void {
      this.context.someValue = value;
   }
}
```

Multiple binding classes can share the same context instance within a scenario, enabling cross-class state sharing.

## Decorator Support

The library supports both **TC39 Stage 3 decorators** and **legacy experimental decorators** through a runtime switch.

### Configuration

- `experimentalDecorators` field in `cucumber.json` (or `--experimental-decorators` CLI flag)
- Stored as `global.experimentalDecorators` and `process.env.CUCUMBER_EXPERIMENTAL_DECORATORS`

### Branching

Every decorator function checks `global.experimentalDecorators` to return the appropriate signature:

- **Legacy experimental**: `(target, propertyKey, descriptor)` — stores bindings in module-level arrays
- **TC39 Stage 3**: `(target, context: ClassMethodDecoratorContext)` — stores bindings via `context.metadata` and `context.addInitializer()`

### Transpiler Impact

- `ts-node`/`ts-vue` have `-exp` variants that set `experimentalDecorators: true` in compiler options
- The esbuild transpiler reads `global.experimentalDecorators` to configure `tsconfigRaw`
- TC39 mode uses `lib: ['es2022', 'esnext.decorators']`; legacy mode uses `lib: ['es2022']`

## Diagnostics

### Startup progress

`runCucumber()` prints one append-only line per startup phase to the environment's stdout through `StartupProgress` in `src/utils/startup-progress.ts`: `resolve` (plugins and support globs), `load` (transpile and load support files, then `updateSupportCodeLibrary`), `assemble` (formatters and Gherkin parsing) and `launch` (BeforeAll hooks in serial mode, child processes loading support code in parallel mode; ends on the first `testCaseStarted` envelope). On a TTY each line is `[ spinner ] title — detail counter`: a bracketed `| / - \` spinner in a fixed slot at column 0, the themed title, the plain-language detail, and a `(done/total)` counter at the end. The spinner's colour is independent of the theme and of progress: `spinnerSlot(frame)` picks the glyph from `frame mod 4` and colours each of the slot's three cells from a wheel of stops with linear RGB blends between them (`WHEEL_STOPS`, `STEPS_PER_STOP`), stepping every `FRAMES_PER_COLOUR` frames, a period deliberately not a multiple of four so the colour change drifts around the rotation; each cell lags the one to its left by `WIPE_LAG_FRAMES` so a new colour sweeps across the slot rather than switching at once. When the phase ends the slot becomes `[ ✓ ]` in the theme colour and the counter is replaced by a summary and the elapsed time. Nothing is fitted to the terminal width: the line is printed whole and wraps wherever the terminal wraps it, so a narrow window shows all of the text over several rows and a wide one shows it on one. To make that redrawable the cursor rests on the row after the block between writes (not on the block, where the terminal's caret would cover the spinner), and every frame is a single write of `CSI nA` + `CSI 1G` up to the block's first row, where `n` is the number of rows the block occupied when last drawn, then `CSI 0J` (erase to end of screen), the whole phase line, the message line beneath it when one has been opened, and a newline back to the resting row. Row counts are `ceil(visible length / columns)` per line at the current width, escape sequences excluded. The width is read for every redraw — in the worker through `tty.WriteStream#_refreshSize()`, since a worker gets no resize events — so a window resized mid-phase is still redrawn from the right row. Messages replace one another in place and clear themselves; when the phase ends the block is erased and the closing line written followed by a newline, so the next phase line starts directly beneath it.

Everything after the opening line is drawn by `PhaseRenderer`, a synchronous class with no timers of its own: `start()` redraws at once, `pump()` advances the frame every 130 ms, shows a heartbeat quip after 30 s without a message (a `waiting` variant while nothing has completed yet) and clears a message 8 s after it appeared, `tick()` bumps the counter and, once a gap of 30 s or more between ticks has been followed by five ticks in a row each within 1 s of the last, shows a relief message (the unit that ends a stall is often followed by another slow one, so relief waits for work to be quick again), `end()` writes the closing line. In `plain` mode (non-TTY) nothing is redrawn and messages and the closing text are appended. Where it runs depends on the stream:

- **Terminal with a file descriptor** (`process.stdout` in the CLI): `StartupProgress` starts `startup-progress-worker.js` in a `worker_threads` Worker (unref'd, one per run, started on the first phase) and the renderer lives there, writing through a `tty.WriteStream` opened on the same `fd` on the worker's own event loop. Two Windows-console details shape those writes. First, the TTY stream rather than raw `fs.writeSync`: raw bytes reach the console under its OEM code page, so `—` renders as `ΓÇö` and takes three cells, the line occupies more rows than the renderer counted, and every redraw lands on the wrong row; the TTY stream converts to UTF-16 and uses the wide-character console write, like `process.stdout` on the main thread. Second, `CSI 1G` rather than `\r` for column 0: libuv's TTY writer remembers the last line-ending character seen on a handle and swallows a `\r` that directly follows a `\n` (treating the pair as a reordered `\r\n`), and every closing line ends with a newline, so a `\r`-based redraw right after it would erase the row but leave the cursor where the main thread's opening text ended. This is the whole point of the worker: the main thread is blocked for most of a phase — the first support file's `import()` runs its entire graph through the in-thread ESM hooks and the Vue compiler before returning, and the CJS transpilers `require()` every file synchronously — so a main-thread timer cannot fire and a main-thread spinner freezes. The main thread writes the phase line, posts `start` / `tick` / `end` commands, and on `end` blocks in `Atomics.wait` on a shared `Int32Array` until the worker has written the closing text (2 s timeout, after which the main thread writes it itself), which keeps the two threads' writes in order. The worker resolves the theme by name and inherits the main thread's detected colour depth through `FORCE_COLOR`, because a worker has no TTY of its own for ansis to probe.
- **Anything else** (a non-TTY stream, a stream without an `fd`, or a missing worker script): the renderer runs in-thread with a `setInterval`, drawing the spinner only when the stream is a TTY. On a non-TTY stream the output is append-only: the phase line, any heartbeat quips, the closing text.

Units of work are fed by callbacks rather than globals so the API entry points (`loadSupport`, `reloadSupport`) stay silent:

| Phase      | Unit-of-work source                                                                                                                               |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `load`     | `getSupportCodeLibrary({ onFileLoaded })`, called after each `require` / `import`                                                         |
| `assemble` | `gherkinDocument` envelopes on the event broadcaster                                                                                      |
| `launch`   | `makeRuntime({ onWorkerReady })` → `ChildProcessAdapter`, fired on each child's `READY`                                                   |

`TSFLOW_THEME` picks the labels (`lotr` opts into The Lord of the Rings; `off` disables the output; anything else is the default pickling theme). The reporter is created only in the main process, and every method is a no-op when the theme is off.

### Verbose logging and timing

Two environment variables expose what the runtime is doing. Both are read once per thread and cost a single boolean check per call site when unset.

- `TSFLOW_VERBOSE=true` — untimed checkpoint logging via `src/utils/tsflow-logger.ts` (and its `.mjs` twin for the ESM loaders). Per-file checkpoints in the resolve/load hooks, transpilers and Vue SFC compiler are guarded behind `isVerbose()` so their detail objects are never built when off.
- `TSFLOW_TIMING=true` — startup timing via `src/utils/tsflow-timing.ts` (and its `.mjs` twin). Records wall-clock time per phase and per file, then `runCucumber()` prints a report to stderr with a phase table per context, file totals per context, and a slowest-25-files table.

### Timing collection

Every execution context records into its own store on `globalThis.__TSFLOW_TIMING` (shared between the CJS build and the `.mjs` twin within one thread) and the main process aggregates them:

| Context | Scope | Channel back to the main process |
| --- | --- | --- |
| Main process | `main` | — |
| ESM loader hooks thread (`module.register()`: the ts-node loaders, third-party loaders, or `TSFLOW_ESM_HOOKS=async`) | `esm-hooks` | `MessageChannel` port passed as `register()` `data`; the loader's `initialize` export stores it and answers snapshot requests |
| Parallel child process | `worker:<id>` | `TIMING` IPC message sent before `READY` |

Loaders attached in-thread with `module.registerHooks()` (the esbuild loaders, see [ESM loader registration](#esm-loader-registration)) share the registering thread's store, so their `esm:hooks-init`, `esm:resolve` and `esm:load` phases appear directly under `main` or `worker:<id>` and no `esm-hooks` section is produced for them. Nested contexts compose as `worker:<id>/esm-hooks`. Per-file records have four kinds: `transpile` (esbuild `transformSync` / `compileVueSFC` only — ts-node's TypeScript transpile is not observable), `load` (ESM `load` hook wall time), and `require` / `import` (top-level support-file load including dependencies). The same file appearing under `main` and `worker:*` is the N+1 transpile multiplication made visible.

## Transpilers

Transpilers are loaded as CJS `requireModule` entries or ESM `loader` entries based on configuration.

### Backends

| Transpiler | Module System | Decorator Mode | Platform |
| --- | --- | --- | --- |
| `es-node` | CJS | Both | Node |
| `ts-node` | CJS | Standard | Node |
| `ts-node` (exp) | CJS | Experimental | Node |
| `es-vue` | CJS | Both | Vue |
| `ts-vue` | CJS | Standard | Vue |
| `ts-vue` (exp) | CJS | Experimental | Vue |
| `es-node-esm` | ESM | Both | Node |
| `ts-node-esm` | ESM | Both | Node |
| `es-vue-esm` | ESM | Both | Vue |
| `ts-vue-esm` | ESM | Both | Vue |

### Core Components

- `esbuild.ts` — wraps `esbuild.transformSync()`, maps file extensions to loaders, supports both decorator modes
- `esbuild-transpiler.ts` — implements `ts-node-maintained`'s `Transpiler` interface using the esbuild wrapper
- `vue-sfc-compiler.ts` — compiles `.vue` SFCs using `vue/compiler-sfc` (`parse`, `compileScript`, `compileTemplate`, `compileStyle`) then transpiles the output via esbuild
- `transpile-cache.ts` — content-addressed on-disk cache wrapped around `transpileCode` (CJS and ESM) and `compileVueSFC`; see [Transpile cache](#transpile-cache)

ESM loaders live under `src/transpilers/esm/` (authored `.mjs`, copied verbatim to `lib/`) and act as Node.js module customization hooks. `esnode-loader.mjs` and `esvue-loader.mjs` are built by `createEsbuildLoader()` in `loader-utils.mjs` and transpile `.ts`/`.tsx` with `esbuild.transformSync` directly (`esbuild.mjs`, `sourcemap: 'both'`: the map is inlined for Node and kept on `globalThis.__CUCUMBER_TSFLOW_SOURCE_MAPS` by module URL for callsite resolution) and `.vue` with the shared SFC compiler; they do not use ts-node. `tsnode-loader.mjs` (`ts-node-esm`) creates a `ts-node-maintained` service and delegates to its ESM hooks; `vue-loader.mjs` (`ts-vue-esm`) delegates TypeScript to `ts-node-maintained/esm`.

### ESM loader registration

`src/api/register-loaders.ts` (`registerLoader()`) is the single place the two registering contexts — `getSupportCodeLibrary` in the main process and the parallel child — attach a loader, and it chooses between two mechanisms:

- **Synchronous, in-thread** (`module.registerHooks()`, Node 22.15 / 23.5 or later): used for tsflow's own esbuild loaders. The `.mjs` module is `import()`ed into the registering thread by path and its `resolve`/`load` are passed to `registerHooks()`. Nothing crosses a thread boundary: no `postMessage` per resolve, no structured clone of each transformed source. Registration is deduplicated per thread, since hooks stack.
- **Asynchronous, hooks thread** (`module.register()`): used for the ts-node loaders (their hooks await ts-node's asynchronous hooks), for any third-party loader in the `loader` list, on Node versions without `registerHooks`, and when `TSFLOW_ESM_HOOKS=async` is set.

The esbuild loaders' hooks are written to work under both mechanisms: every helper in `loader-utils.mjs` is synchronous, the hooks read sources with `readFileSync` instead of consulting `nextLoad`, and they never inspect what `nextResolve`/`nextLoad` return (a value in-thread, a promise on the hooks thread) — they return it as-is. Synchronous hooks are also invoked for every `require()` on the thread; `isRequire(context)` (`context.conditions` contains `'require'`) short-circuits those to Node's default loader, because the extension probing and `format: 'module'` results are only correct for `import`.

### ESM loader caches

`loader-utils.mjs` keeps two process-lifetime caches, both correct for a one-shot CLI run and cleared together by the exported `clearResolutionCaches()`:

- `pathResolutionCache` — bare specifier → tsconfig `paths` match (or `null`)
- `extensionResolutionCache` — absolute extensionless path → resolved file URL (or `null`), shared by every importer of the same module and by aliased and relative spellings of it

The tsconfig `paths` rewrite regexes used by `esbuild.mjs` and `tsnode-loader.mjs` are compiled once per process, and the `ts-node` service `tsnode-loader.mjs` creates passes `files: false` because with `transpileOnly: true` the tsconfig `include` walk feeds nothing.

### Transpile cache

`src/transpilers/transpile-cache.ts` is a content-addressed on-disk cache wrapped around the three transpile entry points: `transpileCode` in `esbuild.ts` (the CJS esbuild path, reached through ts-node's `Transpiler` plugin), `transpileCode` in `esm/esbuild.mjs` (the esbuild ESM `load` hook, which loads the CJS build through `createRequire` so all three share one module instance and one set of counters per thread) and `compileVueSFC` in `vue-sfc-compiler.ts` (every Vue transpiler, CJS and ESM; the ESM `loadVue` still runs its cheap `transformImports` regex pass over the cached output). `withTranspileCache(kind, filename, source, configuration, produce)` keys an entry on a SHA-256 of the entry format, the library version, `kind`, the caller's serialised configuration, the file name and the source. The configuration carries everything else that shapes the output: the full esbuild transform options (with `tsconfigRaw`, hence the decorator mode) and the esbuild version; for the ESM path also the tsconfig `absoluteBaseUrl` and `paths`, because `rewritePathMappings` bakes them into the output as `file://` URLs, so entries are not portable across checkouts and must not be; for Vue the style flag, output format, decorator mode and the consumer's `vue` version. Nothing is keyed on path or mtime alone, so a stale entry cannot be served: a changed input is a different key.

Entries are JSON files named by the key, written to a temp file and renamed into place, so the N+1 contexts of a `parallel` run (coordinator and children) racing to populate an empty cache never see a partial entry, and the last writer of an identical result wins. Writes are best-effort and a failed or unparseable read is a miss and is deleted, so the cache can change whether a transpile runs but never what it returns. The directory is `TSFLOW_TRANSPILE_CACHE_DIR`, else `.cache/cucumber-tsflow/transpile` under the nearest `node_modules` at or above the working directory (else under the nearest `package.json`, else the OS temp directory). `TSFLOW_TRANSPILE_CACHE=false` disables reads and writes; `loadConfiguration` sets that variable from the `transpileCache` option (`--transpile-cache` / `--no-transpile-cache`, default true, an existing environment value acting as the default), which is how the setting reaches every thread and process, including the ESM hooks thread under `module.register()`.

`runCucumber` appends the main process's `N of M transpiles from the cache` to the load-phase summary and then calls `pruneTranspileCache()`, which only when this process wrote entries lists the directory and deletes the least recently written files until it fits in 512 MB (a content-addressed store's garbage is exactly the entries no current source produces any more, and those are the oldest). In the `TSFLOW_TIMING` report, hits and misses are the `transpile-cache:hit` / `transpile-cache:miss` phases (the `calls` column is the count; a hit also records a `transpile` file entry for the lookup time so per-context file counts stay comparable between cold and warm runs), and `transpile-cache:prune` is the sweep.

## Formatters

### Behave JSON Formatter

`BehaveJsonFormatter` extends CucumberJS's `JsonFormatter` to produce JSON compatible with Behave Pro (Jira integration). Lowercases status names and converts durations to nanoseconds.

### JUnit Bamboo Formatter

`JunitBambooFormatter` extends CucumberJS's `Formatter` to produce JUnit XML using `xmlbuilder`. Organizes results into test suites by feature with test cases by scenario.

### TsFlow Snippet Syntax

`TsflowSnippet` generates TypeScript decorator-style step definition snippets (with `@given()`/`@when()`/`@then()` patterns) instead of CucumberJS's default functional style.

Format aliases in configuration: `behave:path` maps to `@lynxwall/cucumber-tsflow/behave`, `junitbamboo:path` maps to `@lynxwall/cucumber-tsflow/junitbamboo`.

## Gherkin Extensions

- `GherkinFeature` parses `.feature` files using `@cucumber/gherkin` and returns structured `ParsedFeature` models with support for data tables, doc strings, scenario outlines, tags, and i18n
- `GherkinManager` loads features from glob paths and provides `findFeaturesByStepFile()` — parses a step definition file's decorators via regex, extracts patterns and tags, and matches them against parsed features (used by the `--debug-file` CLI option)

## CLI

The CLI entry point is `bin/cucumber-tsflow.js`. Before requiring anything else it enables Node's module compile cache (`module.enableCompileCache()`, Node 22.8 or later) and exports the cache directory as `NODE_COMPILE_CACHE`, so that the library, its dependencies and the transpiled support code are served from cached V8 bytecode in this process and in every forked child and worker thread. Next it prints a one-line bootstrap notice to stdout in `ansis.dim`, the phase-detail grey (`ansis` is required by the bin on its own for this; the library loads it moments later regardless), and sets `globalThis.__CUCUMBER_TSFLOW_BOOTSTRAP_ANNOUNCED`, which `lib/cli/run.ts` reads to print `cucumber-tsflow loaded in N ms.` on entry (`performance.now()`, the same figure as the `bootstrap` timing phase) before configuration loads; both lines are skipped for the informational switches (`--version`, `--help`, `--i18n-languages`, `--i18n-keywords`) and under `TSFLOW_THEME=off`, and neither appears for programmatic callers, who never go through the bin. It then delegates to the `Cli` class.

`Cli` parses arguments via `ArgvParser` (built on `commander`) and adds custom options beyond CucumberJS:

- `--debug-file <path>` — path to a step file to auto-discover matching features
- `--enable-vue-style` — compile Vue SFC `<style>` blocks
- `--experimental-decorators` — enable legacy TypeScript decorators
- `--transpiler <name>` — select transpiler backend

After parsing, the CLI calls `loadConfiguration()` then `runCucumber()`.

## API Layer

The public programmatic API (`@lynxwall/cucumber-tsflow/api`) exposes:

- `loadConfiguration()` — locates config file, merges profiles, configures transpiler selection, handles `--debug-file` feature matching, and sets up format aliases
- `loadSupport()` — loads support code; also provides `reloadSupport()` for delta-aware module eviction
- `runCucumber()` — the main execution entry point that orchestrates the full test run
- `getSupportCodeLibrary()` — resets and builds the CucumberJS support code library from loaded step definitions

## Package Exports

| Export Path | Purpose |
| --- | --- |
| `.` | Main entry: everything in `./bindings` plus the formatters, snippet syntax, `version` and the deprecated `Cli` (required lazily on first construction) |
| `./bindings` | Decorators, context classes and CucumberJS support-code helpers only — the light import for step-definition files |
| `./api` | Programmatic API |
| `./behave` | Behave JSON formatter |
| `./junitbamboo` | JUnit Bamboo formatter |
| `./snippet` | TsFlow snippet syntax |
| `./esnode` | esbuild Node transpiler |
| `./esvue` | esbuild Vue transpiler |
| `./tsnode` | ts-node standard decorators |
| `./tsnode-exp` | ts-node experimental decorators |
| `./tsvue` | ts-node Vue standard decorators |
| `./tsvue-exp` | ts-node Vue experimental decorators |
| `./lib/transpilers/esm/*` | ESM loaders |
| `./lib/*` | Internal CJS modules |

`.`, `./bindings` and `./api` each pair a CJS build with a hand-written `.mjs` wrapper (`src/wrapper.mjs`, `src/bindings.mjs`, `src/api/wrapper.mjs`) that re-exports the CJS module's names for ESM consumers; `api/index.d.ts` and `bindings/index.d.ts` at the package root are stubs for TypeScript configurations that do not read `exports`.

## Monorepo Structure

The project uses Yarn 3.5.0 workspaces:

- `cucumber-tsflow/` — the library package (published as `@lynxwall/cucumber-tsflow`)
- `cucumber-tsflow-specs/` — 8 private test workspace packages covering the Node/Vue × CJS/ESM × Standard/Experimental matrix

### Test Workspaces

| Package | Module | Decorators | Platform |
| --- | --- | --- | --- |
| `node/` | CJS | TC39 Standard | Node |
| `node-esm/` | ESM | TC39 Standard | Node |
| `node-exp/` | CJS | Experimental | Node |
| `node-exp-esm/` | ESM | Experimental | Node |
| `vue/` | CJS | TC39 Standard | Vue |
| `vue-esm/` | ESM | TC39 Standard | Vue |
| `vue-exp/` | CJS | Experimental | Vue |
| `vue-exp-esm/` | ESM | Experimental | Vue |

Shared feature files in `cucumber-tsflow-specs/features/` are tagged (`@node`, `@vue`, `@node-exp`, etc.) for per-variant filtering. Each variant produces JSON, HTML, and XML reports under `cucumber-tsflow-specs/reports/`.
