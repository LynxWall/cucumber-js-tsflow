# Startup Cost Analysis — Support-Code Discovery, Transpilation, and Registration

## Scope

This analysis targets the phase a consumer experiences as "nothing is happening yet": the interval between
invoking `cucumber-tsflow` and the first progress dot. It covers path resolution, transpiler bootstrap,
per-file transpilation, decorator registration, and how those costs are multiplied by parallel execution.

It deliberately does not cover step execution, world/context activation, formatter output, or reporting.

The observation driving it: on a large suite, the pre-run phase dominates, and it dominates regardless of
whether the modern ESM loaders or the older CJS `require`-hook transpilers are used. That symmetry is
itself a clue — the bottleneck is not in either loader implementation specifically, it is in the shared
model both of them sit on.

## The pre-run timeline

Reading [cucumber-tsflow/src/cli/run.ts](cucumber-tsflow/src/cli/run.ts) →
[cucumber-tsflow/src/cli/index.ts](cucumber-tsflow/src/cli/index.ts) →
[cucumber-tsflow/src/api/run-cucumber.ts](cucumber-tsflow/src/api/run-cucumber.ts), the sequence before any
scenario runs is:

1. `loadConfiguration` — locate and parse `cucumber.json`, merge profiles, then push a transpiler
   `requireModule` or `loader` onto the config ([cucumber-tsflow/src/api/load-configuration.ts](cucumber-tsflow/src/api/load-configuration.ts)).
2. `resolvePaths` — glob feature files, `require` paths, and `import` paths.
3. Optional `parallelPreload` — spawn worker threads that load a slice of the support files
   ([cucumber-tsflow/src/api/parallel-loader.ts](cucumber-tsflow/src/api/parallel-loader.ts)).
4. `getSupportCodeLibrary` — install the transpiler hook, then `require()` every CJS support file and
   `await import()` every ESM support file, **one at a time**
   ([cucumber-tsflow/src/api/support.ts](cucumber-tsflow/src/api/support.ts)).
5. Decorator evaluation during (4) — every `@given`/`@when`/`@then`/`@before`/… captures a stack trace and
   resolves it through a source map ([cucumber-tsflow/src/utils/our-callsite.ts](cucumber-tsflow/src/utils/our-callsite.ts)).
6. Gherkin parsing, formatter init, runtime construction.
7. If `parallel > 0`, fork N child processes, each of which **repeats steps 2, 4 and 5 in full**
   ([cucumber-tsflow/src/runtime/parallel/worker.ts](cucumber-tsflow/src/runtime/parallel/worker.ts)).

Steps 4, 5 and 7 are where the time goes.

## Root causes, ranked by leverage

### 1. There is no transpile cache anywhere — not on disk, not between processes

This is the single largest finding. A search across `cucumber-tsflow/src` for any cache write
(`writeFileSync`, `mkdirSync`, `createHash`, `node_modules/.cache`) returns exactly one unrelated hit in
the Gherkin manager. Nothing else persists.

Consequences:

- **Every invocation is a cold start.** Changing one step file re-transpiles the entire support tree.
  A developer running the same suite ten times pays the full transpilation cost ten times.
- **`ts-node-maintained` caches in memory only.** `transpileOnly: true` means output is held in the
  process's own module registry ([cucumber-tsflow/src/transpilers/tsnode.ts](cucumber-tsflow/src/transpilers/tsnode.ts),
  [cucumber-tsflow/src/transpilers/esnode.ts](cucumber-tsflow/src/transpilers/esnode.ts)). It dies with the process.
- **The `parallelLoad` feature cannot deliver what its own comments claim.** The header of
  [cucumber-tsflow/src/api/parallel-loader.ts](cucumber-tsflow/src/api/parallel-loader.ts) states that workers
  "warm the transpiler's on-disk cache" and that the main thread's subsequent load "hits warm caches."
  There is no on-disk cache to warm. Worker threads are separate V8 isolates with independent module
  registries; the transpiled output they produce is discarded when `worker.terminate()` is called.

  What `parallelLoad` actually buys is OS page-cache warming of source files. What it actually costs is
  N × (esbuild service process spawn + `ts-node` service creation + tsconfig parse + full duplicate
  transpilation of a file slice), plus structured-clone serialization of a `descriptors` payload that the
  main thread collects and then never validates against anything. On a cold run with a warm-enough
  filesystem cache, this is plausibly net-negative.

**Recommendation.** Add a content-addressed on-disk cache keyed on
`hash(source bytes + transpiler identity + resolved compiler options + tool version)`, storing
`{ code, map }` under `node_modules/.cache/cucumber-tsflow/`. This is the enabling change for almost
everything else: it makes repeat runs near-instant, it makes `parallelLoad` genuinely useful (workers
populate a cache the main process and every forked child then read), and it makes parallel child-process
startup cheap. It also aligns the implementation with what the existing documentation already promises.

Cache invalidation should be purely content-based, with the tool version in the key, so there is no
staleness window and no need for a watch/mtime story.

### 2. Per-file `transformSync` against esbuild's out-of-process service

Both the CJS and ESM esbuild paths call `transformSync` once per file
([cucumber-tsflow/src/transpilers/esbuild.ts](cucumber-tsflow/src/transpilers/esbuild.ts),
[cucumber-tsflow/src/transpilers/esm/esbuild.mjs](cucumber-tsflow/src/transpilers/esm/esbuild.mjs)), driven
by `ts-node`'s synchronous `Transpiler` interface
([cucumber-tsflow/src/transpilers/esbuild-transpiler.ts](cucumber-tsflow/src/transpilers/esbuild-transpiler.ts)).

esbuild is a Go binary reached over a pipe. `transformSync` pays a fixed per-call round-trip and, worse,
**blocks the Node event loop for its entire duration**. The actual TypeScript-to-JavaScript work is
microseconds; the IPC framing is not. At a few thousand support files this fixed overhead alone becomes
seconds, and it is unparallelizable by construction because it is synchronous.

This is why esbuild "feels" no faster than `ts-node` here: the architecture throws away esbuild's two real
advantages — its Go-level internal parallelism and its ability to process a whole module graph in one
invocation.

**Recommendation, incremental.** Cache (item 1) removes most calls on repeat runs.

**Recommendation, structural.** Replace per-file transformation with a single `esbuild.build()` pass over
all support entry points: `bundle: true`, `packages: 'external'`, `platform: 'node'`, `outdir` pointed at
the cache directory, `format: 'cjs'` or `'esm'` per variant, `splitting: true` for ESM, and esbuild's own
`metafile` used to record the input set for cache-key purposes. One invocation replaces N × (resolution +
IPC + transform), and esbuild parallelizes internally across cores. The support library then loads from a
small number of pre-built artifacts.

The complication is that decorator registration currently depends on module identity and evaluation order
across separate files; bundling must preserve per-file `callsite` information (esbuild source maps handle
this) and must not collapse two files that register the same step pattern into a single module identity.
Worth prototyping against the existing spec matrix before committing.

### 3. Parallel execution multiplies the load cost by N + 1

In parallel mode the main process performs a complete support load in `runCucumber` (it needs the
finalized library for `supportCodeIds` and support-code messages), and then
[cucumber-tsflow/src/runtime/parallel/adapter.ts](cucumber-tsflow/src/runtime/parallel/adapter.ts) forks N
children, each of which calls `resolvePaths` again, installs the transpiler again, and `require`s /
`import`s every support file again ([cucumber-tsflow/src/runtime/parallel/worker.ts](cucumber-tsflow/src/runtime/parallel/worker.ts)).

So total pre-run transpilation work is `(N + 1) × full support tree`, and each of those N + 1 loads is
internally serial. With `parallel: 8` on a large suite this is the dominant term in wall-clock startup, and
it scales the wrong way: adding workers to make execution faster makes startup slower.

Additional waste in the same path:

- Each child re-globs the source and support paths via `resolvePaths`, despite the coordinator already
  having the resolved lists and already sending `supportCodeCoordinates` over IPC.
- Each child spawns its own esbuild service process.
- Each child re-parses the tsconfig chain (twice, in the ESM case — see item 6).

**Recommendations.**

- Send the already-resolved `requirePaths` / `importPaths` to children in the `INITIALIZE` message instead
  of having each child re-run `resolvePaths`. This is a small, low-risk change with an immediate win.
- With the disk cache in place (item 1), children read pre-transpiled output rather than re-transpiling.
- Consider staggering or gating child startup so that the first child does not begin loading while the
  coordinator is still transpiling into an empty cache — otherwise N + 1 processes race to compile the
  same files and every one of them does the full work. A simple file-lock or "coordinator finishes load
  before forking" ordering avoids the thundering herd.
- Evaluate whether the coordinator needs a full support load at all in parallel mode, or whether it can
  derive `supportCodeIds` from a cached manifest.

### 4. Stack capture and source-map resolution on every decorator

[cucumber-tsflow/src/utils/our-callsite.ts](cucumber-tsflow/src/utils/our-callsite.ts) does this for every
single decorated method, at module-evaluation time:

```ts
private static callsites() {
    const _prepareStackTrace = Error.prepareStackTrace;
    Error.prepareStackTrace = (_, stack) => stack;
    const stack = new Error().stack?.slice(1) ?? ['', '', 'unknown'];
    Error.prepareStackTrace = _prepareStackTrace;
    return stack;
}

public static capture(): Callsite {
    const stack = Callsite.callsites()[2] as unknown as CallSite;
    const tsStack = sourceMapSupport.wrapCallSite(stack);
    ...
}
```

Three separate costs, paid per binding:

- **Mutating the global `Error.prepareStackTrace`** twice. This invalidates V8's stack-trace fast path and
  is a known deoptimization trigger; doing it thousands of times in a tight load loop is materially worse
  than doing it once.
- **Materializing a full structured stack.** `Error.captureStackTrace` with
  `Error.stackTraceLimit` left at its default walks and allocates far more frames than the one frame
  actually wanted (index `[2]`). Setting `Error.stackTraceLimit = 3` around the capture would cut the
  allocation dramatically.
- **`sourceMapSupport.wrapCallSite` eagerly.** This forces retrieval and `SourceMapConsumer` parse of the
  source map for that file, at load time, purely so that a `filename:line` string is available _in case_
  an ambiguity or missing-step error is later reported. For most runs that string is never read.

`capture()` is invoked from every factory in
[cucumber-tsflow/src/bindings/step-decorators.ts](cucumber-tsflow/src/bindings/step-decorators.ts) and
[cucumber-tsflow/src/bindings/hook-decorators.ts](cucumber-tsflow/src/bindings/hook-decorators.ts). On a
suite with several thousand bindings this is several thousand stack walks and up to one source-map parse
per support file, all in the critical path.

**Recommendation.** Make callsite resolution lazy:

- Capture only the raw frame (`fileName`, `lineNumber`) with `Error.stackTraceLimit` temporarily set to a
  small constant, and set `Error.prepareStackTrace` once at module scope rather than per call.
- Store the unresolved frame on the `StepBinding` and only run `wrapCallSite` inside `Callsite.toString()`
  — i.e. at the moment an ambiguity message, a snippet, or a definition-location message actually needs it.
  `updateSupportCodeLibrary` in [cucumber-tsflow/src/bindings/binding-registry.ts](cucumber-tsflow/src/bindings/binding-registry.ts)
  reads `callsite.filename` / `callsite.lineNumber` for Cucumber's definition metadata, so resolution still
  needs to happen for that path — but it can be batched per file, after loading, instead of interleaved
  with it, and it can be skipped entirely for formatters that do not consume it.
- Consider whether the source-mapped position is needed at all when the transpiler is `transpileOnly`
  esbuild with 1:1 line mapping for most TypeScript constructs.

There is also a portability bug adjacent to this: `ourCallsite.filename.replace(\`${this.cwd}\\\\\`, '')`
hard-codes a Windows path separator, so the path is never made relative on Linux/macOS.

### 5. Support files are loaded strictly serially

[cucumber-tsflow/src/api/support.ts](cucumber-tsflow/src/api/support.ts) does:

```ts
for (const path of importPaths) {
	logger.debug(`Attempting to import code from "${path}"`);
	await import(pathToFileURL(path).toString());
}
```

For the ESM variants this is the worst possible shape. Each `await import()` fully completes — resolve
hook round-trip, load hook round-trip, transform, evaluate — before the next one is even started. The
loader thread sits idle between modules, and the esbuild service sits idle between transforms.

Changing this to a concurrent settle:

```ts
await Promise.all(importPaths.map(p => import(pathToFileURL(p).toString())));
```

lets the loader thread pipeline resolution and transformation of many modules at once. The
`BindingRegistry` is keyed by step pattern and tag, and duplicate detection in
[cucumber-tsflow/src/bindings/binding-registry.ts](cucumber-tsflow/src/bindings/binding-registry.ts) compares
callsites rather than relying on insertion order, so this is likely safe — but it changes the order in
which ambiguity errors surface, so it should be validated against the `validations.feature` specs.

The same serial pattern is repeated in
[cucumber-tsflow/src/runtime/parallel/worker.ts](cucumber-tsflow/src/runtime/parallel/worker.ts) and in
[cucumber-tsflow/src/api/loader-worker.ts](cucumber-tsflow/src/api/loader-worker.ts).

CJS `require` cannot be parallelized this way, which is a further argument for the bundling approach in
item 2 as the general fix.

### 6. Redundant and over-broad tsconfig work

Config discovery happens independently in at least four places per process:

| Location                                                                                                                                        | Mechanism                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| [cucumber-tsflow/src/transpilers/tsnode.ts](cucumber-tsflow/src/transpilers/tsnode.ts) / [esnode.ts](cucumber-tsflow/src/transpilers/esnode.ts) | `tsconfig-paths.register()` — patches `Module._resolveFilename` globally |
| [cucumber-tsflow/src/transpilers/esm/loader-utils.mjs](cucumber-tsflow/src/transpilers/esm/loader-utils.mjs)                                    | `tsconfig-paths.loadConfig(process.cwd())`                               |
| [cucumber-tsflow/src/transpilers/esm/esbuild.mjs](cucumber-tsflow/src/transpilers/esm/esbuild.mjs)                                              | `tsconfig-paths.loadConfig(process.cwd())` again, separate cache         |
| [cucumber-tsflow/src/transpilers/esm/tsnode-service.mjs](cucumber-tsflow/src/transpilers/esm/tsnode-service.mjs)                                | `ts-node`'s own tsconfig resolution                                      |

Each reads and parses the tsconfig chain (including `extends`) from disk. On a large project with a deep
extends chain this is not free, and it is repeated in every parallel child and every preload worker.

Worse, `tsnode-service.mjs` sets:

```js
process.env.TS_NODE_FILES = process.env.TS_NODE_FILES || 'true';
```

and passes `files: true`. This instructs TypeScript to expand the tsconfig `files`/`include` globs and
enumerate the entire project's file set — on a large monorepo package that is a full recursive directory
walk. Under `transpileOnly: true` there is no type-checking program for those files to feed, so the work is
almost entirely wasted. This applies only to the ESM path; the CJS transpilers do not set it, which may
partly explain any perceived ESM/CJS startup difference.

**Recommendations.**

- Drop `files: true` / `TS_NODE_FILES` from the ESM service unless a specific behaviour depends on it, and
  if something does, scope it rather than defaulting it on.
- Resolve tsconfig once per process and share the result across `loader-utils.mjs`, `esbuild.mjs`, and the
  `ts-node` service, rather than three independent loads with three independent caches.
- Pass the resolved config from the coordinator to parallel children over IPC so children skip discovery.

### 7. The ESM loader hot path

Three issues in [cucumber-tsflow/src/transpilers/esm/loader-utils.mjs](cucumber-tsflow/src/transpilers/esm/loader-utils.mjs):

**Filesystem probing.** `resolveWithExtensions` tries seven extensions, then seven `index.*` variants,
each with a synchronous `existsSync`. That is up to 14 stat syscalls per extensionless relative specifier,
with no negative-result cache. On Windows, `stat` is significantly more expensive than on Linux, which
matches the reported experience. Adding a `Map`-based cache of resolved and unresolved specifiers (the
adjacent `pathResolutionCache` already does this for tsconfig paths, so the pattern is established) would
eliminate repeats, and ordering the extension list by observed frequency would shorten the common case.

**Loader-thread round trips.** Hooks registered via `register()` execute on a dedicated loader thread.
Every `resolve` and every `load` is an asynchronous `postMessage` round trip, and `load` results carry the
full transformed source across the thread boundary via structured clone. For a large support tree that is
thousands of round trips plus megabytes of copying. Node 22+ provides `module.registerHooks()`, which runs
hooks synchronously in the main thread and eliminates both costs. Given the package already requires
Node >= 22, this is available and would be a substantial ESM-specific win. It would need care around the
async `loadVue` path, which currently awaits `nextLoad`.

**Eager service construction.** In `createEsbuildLoader`, the `resolve` hook evaluates
`tsNodeHooks: await getLocalEsmHooks()` as an argument on **every** resolve call, including for `node:`
builtins and bare npm specifiers that will never reach the ts-node branch. The result is cached after the
first call, but this forces full `ts-node` service creation — with its tsconfig parse and file enumeration
— during the very first resolution, before it is known to be needed. Passing a thunk instead of an awaited
value defers it correctly.

### 8. Logging allocates in hot paths even when disabled

[cucumber-tsflow/src/utils/tsflow-logger.ts](cucumber-tsflow/src/utils/tsflow-logger.ts) reads
`TSFLOW_VERBOSE` once and returns early when off — but the early return happens _inside_ the function.
Every call site of the form:

```js
loaderLogger.checkpoint('resolve', { specifier, parentURL: context?.parentURL });
```

allocates the detail object, and in several cases performs work to build it (`source?.toString()?.length`
in `loadVue`, `Object.keys(...)` in the config loader) before the call is made and immediately discarded.

The `resolve` and `load` hooks and the `transpile` function are called once per module — sometimes several
times per module. This is per-module garbage generation and, in the case of `sourceLength:
source?.toString()?.length`, a full buffer-to-string conversion performed solely to compute a number that
is then thrown away.

**Recommendation.** Export the `VERBOSE` flag and guard hot call sites with `if (isVerbose())`, or change
the logger signature to accept a lazily-invoked thunk for `detail`. The non-hot paths (CLI, configuration)
can stay as they are.

### 9. The public barrel pulls in the entire library

Every support file starts with something like:

```ts
import { binding, given, when, then } from '@lynxwall/cucumber-tsflow';
```

[cucumber-tsflow/src/index.ts](cucumber-tsflow/src/index.ts) resolves that to a barrel that imports
`./cli` — which transitively pulls in `run-cucumber`, `make-runtime`, the parallel adapter, the Gherkin
manager, every built-in and custom formatter, `ansis`, `debug`, and the `@cucumber/cucumber` formatter
tree. None of that is needed to evaluate a decorator.

In a single process this is a one-time cost paid at the first support-file import, but it is paid again in
every parallel child process and every preload worker thread, and it sits squarely in the critical path
before the first file is transpiled.

**Recommendation.** Add a lightweight entry point (for example `@lynxwall/cucumber-tsflow/bindings`)
exporting only `binding`, the step and hook decorators, and the context types, and recommend it for
support code. New entry points need a matching key in the `exports` map of
[cucumber-tsflow/package.json](cucumber-tsflow/package.json). The existing barrel stays for compatibility.
Removing `./cli` from the root barrel would also help and is arguably correct regardless — a library's
public API surface should not drag in its own command-line driver.

### 10. `parallelPreload` carries dead weight

Beyond the cache issue in item 1:

- Workers collect and serialize `SerializableBindingDescriptor[]` back to the main thread. The header
  comment says these are "used for validation." Tracing the return value through
  [cucumber-tsflow/src/api/load-support.ts](cucumber-tsflow/src/api/load-support.ts) and
  [cucumber-tsflow/src/api/run-cucumber.ts](cucumber-tsflow/src/api/run-cucumber.ts), they are only counted
  for a log line. This is structured-clone cost for nothing.
- Thread count auto-detection caps at 4 (`Math.min(availableParallelism(), 4)`). On the developer and CI
  machines where a large suite is actually run, that is likely leaving cores idle. The cap should be
  reconsidered once the preload phase does something durable.
- The browser-global shim block at the top of
  [cucumber-tsflow/src/api/loader-worker.ts](cucumber-tsflow/src/api/loader-worker.ts) constructs a full
  `window` stand-in by copying every own property of `globalThis` — per worker, at worker startup, before
  any useful work begins.

## Suggested ordering

The items are not independent; roughly this order maximizes payoff per unit of risk.

| Phase | Change                                                                  | Expected effect                                                                     |
| ----- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 1     | On-disk content-addressed transpile cache (item 1)                      | Repeat runs drop to near-zero transpile cost; makes 3 and 10 meaningful             |
| 1     | Lazy callsite resolution + `stackTraceLimit` (item 4)                   | Removes per-binding stack walk and per-file source-map parse from the critical path |
| 1     | Drop `files: true` / `TS_NODE_FILES` (item 6)                           | Removes a full project directory walk per ESM process                               |
| 1     | Guard hot-path logger calls (item 8)                                    | Cheap; removes per-module allocation                                                |
| 2     | Concurrent `import()` of support files (item 5)                         | Pipelines the ESM loader; validate against `validations.feature`                    |
| 2     | Pass resolved paths + config to parallel children (items 3, 6)          | Removes N re-globs and N tsconfig parses                                            |
| 2     | Cache negative resolutions in `resolveWithExtensions` (item 7)          | Removes redundant `stat` storms, most visible on Windows                            |
| 2     | Defer `getLocalEsmHooks()` behind a thunk (item 7)                      | Stops eager `ts-node` service creation on first resolve                             |
| 3     | Lightweight `bindings` entry point (item 9)                             | Cuts per-process module-graph cost                                                  |
| 3     | `module.registerHooks()` for the ESM path (item 7)                      | Eliminates loader-thread round trips and source copying                             |
| 4     | esbuild `build()` bundling to replace per-file `transformSync` (item 2) | Structural; largest cold-start win but needs the most validation                    |

Phases 1 and 2 are localized and testable against the existing spec matrix. Phase 4 changes the loading
model and should be prototyped behind a config flag before it becomes the default.

## Measurement

None of the above should be accepted on reasoning alone, and the current instrumentation is not adequate
to confirm it. `TSFLOW_VERBOSE` produces a checkpoint log but no timings, so it cannot answer "where did
the 40 seconds go."

Before changing anything, add phase timing that is on by default at a summary level:

- Wall-clock for each of: configuration load, `resolvePaths`, transpiler bootstrap, support load, Gherkin
  parse, runtime construction.
- Within support load: file count, aggregate transpile time, aggregate module-evaluation time, aggregate
  time inside `Callsite.capture`, and cache hit/miss counts once a cache exists.
- In parallel mode: the same breakdown per child, plus the coordinator's own load, so the N + 1
  multiplication is visible rather than inferred.

A `--profile-startup` flag emitting a small JSON summary would make regressions in this area detectable in
CI, which matters because every one of these costs grows with suite size and none of them are visible in
the small spec workspaces used for correctness testing.

The specific number worth tracking on the large suite is **transpile-seconds per support file per run**.
If the cache work lands correctly, that number should approach zero on a second consecutive run with no
source changes. If it does not, the cache key is wrong.
