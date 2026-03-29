# Architecture

`@lynxwall/cucumber-tsflow` wraps and extends CucumberJS, providing SpecFlow-like TypeScript decorator bindings. Users author class-based step definitions decorated with `@binding()`, `@given()`, `@when()`, `@then()`, `@before()`, `@after()`, etc. instead of using CucumberJS's functional API.

## Layers

All source code lives under `cucumber-tsflow/src/`.

| Layer | Directory | Purpose |
| --- | --- | --- |
| CLI | `src/cli/` | Command-line entry point, argv parsing, orchestrates configuration and execution |
| API | `src/api/` | Programmatic API: `loadConfiguration`, `loadSupport`, `runCucumber`, parallel preloader |
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
1. `runCucumber()` optionally runs a parallel preload phase to warm transpiler caches
1. Support code is loaded: transpilers are registered, step definition files are imported, and decorator side-effects populate the `BindingRegistry`
1. `makeRuntime()` creates a `Coordinator` with either an in-process (serial) or child-process (parallel) adapter
1. The coordinator assembles test cases from parsed Gherkin pickles and delegates execution to the adapter
1. Each test case runs through `TestCaseRunner`, which resolves bindings and manages scenario context

## Bindings System

The bindings system maps TypeScript decorators to CucumberJS step and hook definitions.

### Key Files

- `binding-decorator.ts` — the `@binding()` class decorator; detects decorator mode and registers all collected bindings
- `binding-registry.ts` — singleton registry (`BindingRegistry.instance`) stored on `global.__CUCUMBER_TSFLOW_BINDINGREGISTRY`
- `step-binding.ts` — `StepBinding` interface and `SerializableBindingDescriptor` for cross-thread transfer
- `step-decorators.ts` — `@given()`, `@when()`, `@then()` method decorators
- `hook-decorators.ts` — `@before()`, `@after()`, `@beforeAll()`, `@afterAll()`, `@beforeStep()`, `@afterStep()` decorators
- `binding-context.ts` — storage mechanisms for buffering bindings during decoration
- `types.ts` — `StepBindingFlags` bitfield enum and `ContextType` interface

### Registration Flow

1. Method decorators (`@given()`, `@when()`, etc.) create `StepBinding` objects and buffer them in a context-appropriate store
1. The `@binding()` class decorator runs last (class decorators execute after method decorators)
1. It reads all buffered bindings, sets `classPrototype`, and registers them in `BindingRegistry`
1. Each binding is then registered with CucumberJS (`Given()`, `Before()`, etc.) via a trampoline function
1. At runtime the trampoline resolves the correct class instance through `ManagedScenarioContext`

### Registry Internals

The `BindingRegistry` maintains three primary indexes:

- `_stepBindings`: `Map<StepPattern, Map<TagName, StepBinding[]>>` — indexed by pattern then tag
- `_classBindings`: `Map<prototype, ClassBinding>` — per-class bindings and context types
- `_cucumberKeyIndex`: `Map<string, StepBinding>` — O(1) lookup by generated `cucumberKey`

`updateSupportCodeLibrary()` patches CucumberJS's `SupportCodeLibrary` with tsflow-specific metadata (timeouts, tags, binding references) so that the runtime can resolve back to the correct decorator-based definitions.

## Runtime System

### Coordinator

`Coordinator` implements the CucumberJS `Runtime` interface. It assembles test cases from sourced pickles, delegates to an adapter (serial or parallel), and emits `testRunStarted`/`testRunFinished` envelopes.

### Serial Execution

`InProcessAdapter` creates a single `Worker` and runs all test cases sequentially in-process.

### Parallel Execution

Parallel execution uses Node.js child processes:

- `ChildProcessAdapter` forks child processes via `child_process.fork()`, manages worker lifecycle, and distributes test cases over IPC (`INITIALIZE`/`RUN`/`FINALIZE` commands)
- `ChildProcessWorker` runs inside each forked process: loads support code (re-running transpiler registration and decorators), creates its own `MessageCollector`, and executes tests via `Worker`
- `run-worker.ts` is the entry point script forked by the adapter

### Test Case Execution

`TestCaseRunner` runs a single scenario: creates a `World` instance, handles retries, runs before/after hooks, and executes step definitions. It uses `BindingRegistry.instance` to resolve tsflow bindings at each step.

### Message Collector

`MessageCollector` extends CucumberJS's `EventDataCollector` and listens to `envelope` events. It is stored as `global.messageCollector` and provides:

- `getStepScenarioContext()` — matches a step's pattern to find the running scenario's `ManagedScenarioContext`
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

## Parallel Preload

The parallel preload system warms transpiler on-disk caches before the main load phase or before child processes start.

### Design

1. `parallelPreload()` in the main process distributes support files across `worker_threads` (round-robin)
1. Each loader worker sets `global.__LOADER_WORKER = true` to skip CucumberJS registration
1. Workers load files (triggering transpilation) and return `SerializableBindingDescriptor[]` for validation
1. Thread count auto-detects via `availableParallelism()` (capped at 4) or accepts an explicit count
1. After preloading, the main thread performs the authoritative load — hitting warm caches

The preload runs in the main process before any child processes are forked. Parallel child processes benefit from the warm on-disk cache without needing their own preload phase.

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

ESM loaders live under `src/transpilers/esm/` and act as Node.js custom loaders registered via `node:module.register()`.

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

The CLI entry point is `bin/cucumber-tsflow.js`, which delegates to the `Cli` class.

`Cli` parses arguments via `ArgvParser` (built on `commander`) and adds custom options beyond CucumberJS:

- `--debug-file <path>` — path to a step file to auto-discover matching features
- `--enable-vue-style` — compile Vue SFC `<style>` blocks
- `--experimental-decorators` — enable legacy TypeScript decorators
- `--transpiler <name>` — select transpiler backend

After parsing, the CLI calls `loadConfiguration()` then `runCucumber()`.

## API Layer

The public programmatic API (`@lynxwall/cucumber-tsflow/api`) exposes:

- `loadConfiguration()` — locates config file, merges profiles, configures transpiler selection, handles `--debug-file` feature matching, and sets up format aliases
- `loadSupport()` — loads support code with optional parallel preload; also provides `reloadSupport()` for delta-aware module eviction
- `runCucumber()` — the main execution entry point that orchestrates the full test run
- `getSupportCodeLibrary()` — resets and builds the CucumberJS support code library from loaded step definitions

## Package Exports

| Export Path | Purpose |
| --- | --- |
| `.` | Main entry (decorators, types, CucumberJS re-exports) |
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
