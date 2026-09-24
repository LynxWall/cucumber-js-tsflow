# Startup Cost Analysis: Support-Code Scan, Transpile and Load

## Scope

This document analyses only the phase between invoking the `cucumber-tsflow` CLI and the moment
CucumberJS begins emitting step results — the phase where support files are globbed, transpiled,
evaluated and registered. Runtime step execution, formatters and reporting are out of scope.

The analysis is drawn entirely from reading the current source tree. Every claim below points at
the code that produces the cost.

## What actually happens before the first green dot

For a serial run the sequence is:

1. `run()` → `Cli.run()` → `loadConfiguration()` — reads `cucumber.json`, merges the profile, and
   translates `transpiler` into either a `requireModule` (CJS) or a `loader` (ESM) entry
   ([load-configuration.ts:170-222](cucumber-tsflow/src/api/load-configuration.ts#L170-L222)).
1. `runCucumber()` calls `resolvePaths()` (CucumberJS), which runs `glob` over the feature paths
   and then over every `require`/`import` glob to produce the absolute file lists.
1. If `parallelLoad` is set, `parallelPreload()` forks up to four `worker_threads`, and each one
   requires the transpiler and then `require`s/`import`s its round-robin slice of the support
   files ([parallel-loader.ts](cucumber-tsflow/src/api/parallel-loader.ts),
   [loader-worker.ts](cucumber-tsflow/src/api/loader-worker.ts)).
1. `getSupportCodeLibrary()` then performs the authoritative load: it requires each transpiler
   module, requires every CJS support path, registers every ESM loader, and `await import`s every
   ESM support path — all strictly one at a time
   ([support.ts:48-61](cucumber-tsflow/src/api/support.ts#L48-L61)).
1. Module evaluation fires the decorators. Each `@given`/`@when`/`@then`/`@before` factory
   captures a callsite and mints a UUID; each `@binding()` registers into `BindingRegistry` and
   calls into CucumberJS's `Given()`/`Before()`/etc.
1. `BindingRegistry.updateSupportCodeLibrary()` back-patches `uri`/`line` onto every CucumberJS
   definition.
1. Only *now* are the feature files parsed and the pickles filtered
   ([run-cucumber.ts:176-190](cucumber-tsflow/src/api/run-cucumber.ts#L176-L190)).
1. In parallel mode, `ChildProcessAdapter.run()` forks all N children at once, and each child
   independently repeats steps 2, 4, 5 and 6 in full
   ([worker.ts:69-113](cucumber-tsflow/src/runtime/parallel/worker.ts#L69-L113)).

Two things stand out from that sequence. Transpilation output is never persisted anywhere, and the
same transpilation is performed once per process and once per preload thread.

## The core problem: the work is repeated and never persisted

There is no on-disk transpile cache in the codebase. A search for cache writes finds only
`require.cache` eviction in `reloadSupport()`. Neither backend supplies one either:

- `esbuild.transformSync()` is a pure function call — nothing is written to disk
  ([esbuild.ts:75](cucumber-tsflow/src/transpilers/esbuild.ts#L75),
  [esbuild.mjs:164](cucumber-tsflow/src/transpilers/esm/esbuild.mjs#L164)).
- `ts-node-maintained` 10.9.6 caches only in memory, per process. In `transpileOnly` mode its
  output cache is a `Map` created inside `create()`; nothing survives the process.

The consequences compound:

| Configuration | Times every support file is transpiled |
| --- | --- |
| Serial, `parallelLoad: false` | 1 |
| Serial, `parallelLoad: true` | 2 (preload threads, then main thread cold) |
| `parallel: 8`, `parallelLoad: false` | 9 (main + 8 children) |
| `parallel: 8`, `parallelLoad: true` | 10 |

And across runs the multiplier is 1 again every single time — running the same one scenario twice
in a row pays the full transpile cost twice.

### `parallelLoad` currently makes startup slower, not faster

This is the most important finding for a project already using `parallelLoad`.

The stated design is "warm transpiler on-disk caches before the main load phase"
([parallel-loader.ts:1-12](cucumber-tsflow/src/api/parallel-loader.ts#L1-L12), and the Parallel
Preload section of [Architecture.md](Architecture.md)). There is no on-disk cache to warm. The
preload threads transpile into their own thread-local memory and are then terminated
([parallel-loader.ts:163](cucumber-tsflow/src/api/parallel-loader.ts#L163)), after which the main
thread does a completely cold load.

The descriptors the workers return are also discarded. `parallelPreload()` collects them, and both
call sites use them only to print a count — `result.descriptors.length` in a log line and a
console message ([load-support.ts:63-68](cucumber-tsflow/src/api/load-support.ts#L63-L68),
[run-cucumber.ts:118-131](cucumber-tsflow/src/api/run-cucumber.ts#L118-L131)). Nothing is hydrated
from them; there is no `fromDescriptors()` counterpart to `toDescriptors()`.

What the preload phase does cost, on the critical path:

- N extra threads, each requiring the transpiler module, creating its own `ts-node` service, and —
  on the Vue path — booting its own JSDOM.
- N extra esbuild worker threads plus N extra esbuild Go service child processes. `transformSync`
  in Node spawns a dedicated `worker_threads` service per calling thread, so every preload thread
  gets its own.
- Full module evaluation of the entire support tree N times over, including all module-level side
  effects — which is also why the worker needs the 170-line browser-globals shim at the top of
  [loader-worker.ts](cucumber-tsflow/src/api/loader-worker.ts).

So the phase does the expensive part (evaluating every module) while producing nothing the
authoritative load can reuse. On a large suite this is a straight addition to startup time.

## Per-file overheads in the ESM load path

Because the ESM loaders are the path in use, these matter most.

### `files: true` forces a full project directory walk, for nothing

`files: true` is set in
[tsnode-loader.mjs:48](cucumber-tsflow/src/transpilers/esm/tsnode-loader.mjs#L48) and
[tsnode-service.mjs:40](cucumber-tsflow/src/transpilers/esm/tsnode-service.mjs#L40), and
`TS_NODE_FILES` is forced on in
[tsnode-service.mjs:33](cucumber-tsflow/src/transpilers/esm/tsnode-service.mjs#L33) and
[vue-loader.mjs:23](cucumber-tsflow/src/transpilers/esm/vue-loader.mjs#L23). The comment says
"Ensure ts-node respects tsconfig.json files", but that is not what the option does.

In `ts-node`'s configuration loader, `files` controls exactly one thing:

```js
// Only used for globbing "files", "include", "exclude"
// When `files` option disabled, we want to avoid the fs calls
readDirectory: files ? ts.sys.readDirectory : () => [],
```

With `files: true` the resulting `config.fileNames` is consumed in precisely one place —
`const rootFileNames = new Set(config.fileNames)` inside the `if (!transpileOnly)` branch. Every
one of these services sets `transpileOnly: true`, so the file list is computed and thrown away.

What is paid for it is a full recursive `ts.sys.readDirectory` walk of the tsconfig `include`
(default `**/*`) — in the main process, again in every parallel child process, and again in every
preload thread. On a large repository this is seconds of pure filesystem traversal per process.
Removing the option is a no-behavior-change deletion.

### The esbuild path routes through `ts-node` and pays for it

For the `es-node-esm` transpiler, `.ts` files are handled by
[loader-utils.mjs:487-497](cucumber-tsflow/src/transpilers/esm/loader-utils.mjs#L487-L497), which
delegates to `tsNodeHooks.load()`. `ts-node` then calls its configured transpiler, which is the
tsflow esbuild wrapper. So a single `esbuild.transform` is wrapped in a `ts-node` service, module
type classification, `ts-node`'s resolver and its source-map plumbing.

The source-map plumbing is not free. Per file, `ts-node`'s `updateOutput` does:

```js
const base64Map = Buffer.from(updateSourceMap(sourceMap, fileName), 'utf8').toString('base64');
const sourceMapContent = `//# sourceMappingURL=data:application/json;charset=utf-8;base64,${base64Map}`;
```

...where `updateSourceMap` is a `JSON.parse` plus a `JSON.stringify`. So for every support file:
esbuild generates an external map, `ts-node` parses it, re-serializes it, base64-encodes it, and
appends it to the module source — which then roughly doubles the string V8 has to allocate and
scan.

For the esbuild ESM loader specifically, `ts-node` contributes nothing to the `load` step that
tsflow does not already do itself. Calling esbuild directly in `load` and keeping `ts-node` only
for resolution (if at all) removes the service creation, the `files` glob, the classification and
the whole source-map round trip.

### `transformSync` serializes all transpilation

`transformSync` is used in every transpile path
([esbuild.mjs:164](cucumber-tsflow/src/transpilers/esm/esbuild.mjs#L164),
[esbuild.ts:75](cucumber-tsflow/src/transpilers/esbuild.ts#L75),
[vue-sfc-compiler.ts:118](cucumber-tsflow/src/transpilers/vue-sfc-compiler.ts#L118) and
[:258](cucumber-tsflow/src/transpilers/vue-sfc-compiler.ts#L258)). In Node, esbuild implements the
sync API by posting to an internal worker thread and blocking on `Atomics.wait` until the Go
service replies. Each file therefore costs a thread hop plus an IPC round trip, and — critically —
no two files can ever be in flight at once.

The async `esbuild.transform()` API skips the worker-thread hop entirely and lets the Go service
work on many files concurrently across cores. The ESM `load` hook is already `async`, so nothing
structural prevents this. The blocker is only that `ts-node`'s `Transpiler.transpile` interface is
synchronous by contract — which is another reason to call esbuild directly from `load` rather than
through `ts-node`.

The CJS path cannot be made async (`require` is synchronous), which is worth stating plainly: for
a large project the ESM loaders are not just the newer path, they are the only path that can ever
parallelise transpilation.

### Resolution does uncached synchronous filesystem probing

`resolveWithExtensions()` tries seven extensions, then seven `index.*` variants, with an
`existsSync` for each
([loader-utils.mjs:66-107](cucumber-tsflow/src/transpilers/esm/loader-utils.mjs#L66-L107)). There
is no cache — the same specifier resolved from ten different files probes the disk ten times. The
only cache present, `pathResolutionCache`, covers tsconfig path aliases only and is keyed on the
bare specifier.

Also, `createEsbuildLoader`'s `resolve` calls `await getLocalEsmHooks()` on *every* resolve
([loader-utils.mjs:441-446](cucumber-tsflow/src/transpilers/esm/loader-utils.mjs#L441-L446)),
including for bare `node_modules` specifiers that will never reach the `.ts` branch. The hooks are
memoised, but the `async` hop and the eager `ts-node` service construction on the first resolve are
not.

A resolution cache keyed on `specifier + parentURL` is the single cheapest win in this file.

### Regexes are recompiled per file

`rewritePathMappings()` builds a `new RegExp` for every tsconfig path entry, for every file it
transpiles ([esbuild.mjs:63](cucumber-tsflow/src/transpilers/esm/esbuild.mjs#L63)), and
`tsnode-loader.mjs` does the same in its `load` hook
([:105](cucumber-tsflow/src/transpilers/esm/tsnode-loader.mjs#L105)) — plus a `searchRegex.test()`
pass over the whole file before the `replace()` pass. With 20 path aliases and 2,000 files that is
40,000 regex compilations and 80,000 full-source scans. The patterns depend only on
`tsconfig.json` and can be compiled once.

### Verbose-logging arguments are allocated even when logging is off

`createLogger` early-returns when `TSFLOW_VERBOSE` is unset, but the early return happens *inside*
the function. Every `logger.checkpoint('resolve', { specifier, parentURL: context?.parentURL })` in
the resolve and load hot paths still allocates its object literal and evaluates its template
strings on every call. In `loader-utils.mjs` alone there are several per resolve, and resolves
number in the tens of thousands for a large support tree. This is a small constant, but it is a
constant on the hottest loop in the system and it is free to remove by hoisting an `isVerbose()`
guard to the call sites.

## Per-binding overheads at registration time

### `updateSupportCodeLibrary` is quadratic

```ts
const findByKey = (definitions: any[]) => (cucumberKey: string) =>
	definitions.find(s => (s.options as any).cucumberKey === cucumberKey);
```

([binding-registry.ts:232-233](cucumber-tsflow/src/bindings/binding-registry.ts#L232-L233))

Each of the nine `findByKey` closures does a linear `Array.find` over a definition array, and the
loop below calls one per registered binding. With B bindings and D step definitions the cost is
O(B × D). At 3,000 bindings that is roughly nine million property lookups; at 10,000 it is a
hundred million, which is seconds of CPU. It is paid once in the main process and once again in
every parallel child.

The fix is mechanical: build one `Map<cucumberKey, definition>` per definition array up front and
look up in O(1). There is precedent right there in the file — `_cucumberKeyIndex` already does
exactly this for the reverse direction.

### Callsite capture pays a source-map parse per file

`Callsite.capture()` is called at *decorator-factory* evaluation time — once per `@given`,
`@when`, `@then` and hook in every support file
([step-decorators.ts:14](cucumber-tsflow/src/bindings/step-decorators.ts#L14)). Each call
overrides `Error.prepareStackTrace`, throws away an `Error`, and calls
`sourceMapSupport.wrapCallSite()`
([our-callsite.ts:38-46](cucumber-tsflow/src/utils/our-callsite.ts#L38-L46)).

`source-map-support` memoises by file, so the `SourceMapConsumer` construction is once per support
file rather than once per binding — but that still means every support file's source map is parsed
during load, purely to produce a filename and a line number. Since `updateSupportCodeLibrary` needs
`uri`/`line` for the emitted support-code messages this cannot simply be deleted, but it can be
deferred: capture the raw frame during decoration and resolve through source maps once, in bulk,
immediately before `emitSupportCodeMessages`. That also opens the door to skipping it entirely when
no configured format needs it.

### Small per-binding allocations

`shortUuid().new()` in each decorator constructs a fresh base58 translator per binding rather than
reusing one; hoisting `const uuid = shortUuid()` to module scope is a one-line change. Similarly,
`registerStepBinding`'s duplicate check is an `Array.some` over the class's existing bindings,
making it O(m²) per class — harmless for normal classes, but a class with several hundred steps
will notice.

## Structural issues beyond per-file cost

### Support code is loaded before pickles are known

`getSupportCodeLibrary()` runs at
[run-cucumber.ts:99-137](cucumber-tsflow/src/api/run-cucumber.ts#L99-L137);
`getPicklesAndErrors()` and the tag/name filters do not run until
[:177](cucumber-tsflow/src/api/run-cucumber.ts#L177). So `--name "one scenario"` on a project with
thousands of step files transpiles and evaluates every one of them, then discovers it needs three.

At minimum this ordering can be inverted to allow an early exit when the filter matches nothing.
The more valuable version is a persisted pattern index: the registry already knows how to serialize
bindings (`SerializableBindingDescriptor`) and which files they came from
(`getDescriptorSourceFiles()`), so a cached `pattern → file` map from the previous run would let a
filtered run load only the files whose patterns appear in the selected pickles. That needs care —
hooks, context classes and modules with load-time side effects must always load, and any miss must
fall back to a full load — so it belongs behind a flag. But for the "run one scenario in a huge
suite" case it is the difference between a minute and a second.

### Parallel children duplicate everything, including the glob

Each child calls `resolvePaths()` again
([worker.ts:80](cucumber-tsflow/src/runtime/parallel/worker.ts#L80)) even though the coordinator
already has the resolved lists and is sending `supportCodeCoordinates` in the `INITIALIZE` command.
Sending `requirePaths`/`importPaths` instead of re-globbing removes N full glob passes over the
project tree.

The children must still *evaluate* the modules — they need the actual functions — so that cost is
irreducible. Their *transpilation* cost is entirely reducible via a shared cache.

### The preload thread cap is four

`Math.min(availableParallelism(), 4)`
([parallel-loader.ts:204](cucumber-tsflow/src/api/parallel-loader.ts#L204)) leaves most of a modern
CI runner or dev machine idle during the phase that is the bottleneck. Whatever the cap becomes it
should be derived from `availableParallelism()` rather than a constant, and the interaction with
the `parallel` worker count should be explicit rather than accidental.

## Vue-specific notes

Not the primary concern for a Node ESM project, but worth recording:

- `compileVueSFC` compiles each template twice — once with `parseOnly: true` to obtain the AST for
  `compileScript`, then again for real
  ([vue-sfc-compiler.ts:76-88](cucumber-tsflow/src/transpilers/vue-sfc-compiler.ts#L76-L88)).
- `jsdom-global()` boots a full JSDOM per process and per preload thread
  ([esvue.ts](cucumber-tsflow/src/transpilers/esvue.ts),
  [vue-jsdom-setup.mjs](cucumber-tsflow/src/transpilers/esm/vue-jsdom-setup.mjs)).
- `loadVue` regex-rewrites every import in the compiled output
  ([loader-utils.mjs:191-244](cucumber-tsflow/src/transpilers/esm/loader-utils.mjs#L191-L244)),
  doing one `String.replace` over the whole source per matched import.

## Also worth fixing while in the area

`esbuild.mjs`'s exported `supports()` contains a hardcoded repository path check:

```js
if (!filename.includes('cucumber-tsflow-specs')) return false;
```

([esbuild.mjs:130](cucumber-tsflow/src/transpilers/esm/esbuild.mjs#L130))

It is currently dead code — nothing imports `supports` from either esbuild module — so it causes no
harm today. But if it were ever wired up it would silently disable transpilation for every consumer
project. It should be deleted or corrected now rather than discovered later.

## Recommended sequence

### Step 0: make the phase measurable

There is currently no way for a consumer to see where startup time goes. `TSFLOW_VERBOSE=true`
produces an unusable volume of untimed output, and the only timing anywhere is the aggregate
`durationMs` printed by the preload phase.

Add a `TSFLOW_TIMING` mode that reports wall-clock per phase — glob, preload, transpiler init,
per-file transpile, per-file evaluate, registration, `updateSupportCodeLibrary` — plus a
"slowest 25 files" table. Everything below should be validated against real numbers from the
largest suite available, and this is also the artifact that turns "startup feels slow" into a
regression test.

### Step 1: persistent, content-addressed transpile cache

The highest-leverage change. Key on a hash of: source bytes, transpiler identity, resolved
compiler options, `experimentalDecorators`, `enableVueStyle`, the tsflow version, and the
esbuild/`ts-node`/Vue compiler versions. Store `{ code, map }` under
`node_modules/.cache/@lynxwall/cucumber-tsflow/`.

Two integration points cover everything: `EsbuildTranspiler.transpile` for CJS and the ESM `load`
hook. Add a `--no-transpile-cache` escape hatch and a size-bounded eviction policy.

One caveat specific to this codebase: `rewritePathMappings` bakes absolute `file://` URLs into the
output, so cache entries are not portable across checkout paths or machines. The `absoluteBaseUrl`
must be part of the key, and the cache must not be shipped between environments.

The payoff: run two onwards costs a file read instead of a transpile, parallel children stop
duplicating transpile work, and `parallelLoad` finally has something to warm.

### Step 2: delete the free losses

Independent of Step 1, and each individually safe:

1. Remove `files: true` and the `TS_NODE_FILES` forcing from all three ESM services.
1. Replace the `Array.find` closures in `updateSupportCodeLibrary` with `Map` lookups.
1. Send resolved `requirePaths`/`importPaths` to parallel children instead of re-globbing per
   child.
1. Precompile the tsconfig path-mapping regexes once instead of per file.
1. Add a `specifier + parentURL` resolution cache, and stop awaiting `getEsmHooks()` on resolves
   that cannot reach the `.ts` branch.
1. Hoist the `shortUuid()` translator to module scope.
1. Guard hot-path `logger.checkpoint` arguments behind `isVerbose()`.
1. Derive the preload thread count from `availableParallelism()` rather than capping at four.

### Step 3: bypass `ts-node` in the esbuild ESM load path, and go async

With Step 1 in place, make `load` call `esbuild.transform()` directly and asynchronously for
`.ts`/`.tsx` on the `es-node-esm` path, attaching source maps once rather than routing them
through `ts-node`'s parse/stringify/base64 cycle. Then parallelise the top-level import loop in
`getSupportCodeLibrary` — either `Promise.all` outright, or a concurrent transpile-only warm pass
followed by the existing serial evaluation loop if registration order must stay deterministic.
Once the cache is warm that second pass is nearly free, so the conservative variant costs little.

### Step 4: reshape the preload phase

Change `parallelPreload` from "evaluate every module in N threads" to "transpile every module into
the cache in N threads". Transpiling needs no browser globals, no `BindingRegistry`, no decorator
execution and no module side effects — which deletes the entire 170-line `window` shim at the top
of [loader-worker.ts](cucumber-tsflow/src/api/loader-worker.ts) along with the class of bugs it
exists to paper over, and removes the risk of running module-level side effects N+1 times.

The one thing this loses is transitive discovery: evaluating a module naturally pulls in its
imports, whereas a transpile-only pass must find them. esbuild can do the discovery itself with a
`metafile` scan over the support entry points, which is far cheaper than evaluating the graph.

### Step 5: only load what the run needs

Longer-term, and the biggest win for the everyday "run one feature" case:

1. Move Gherkin parsing and pickle filtering ahead of support loading, with an early exit when
   nothing matches.
1. Persist the `pattern → source file` index alongside the transpile cache, and on a filtered run
   load only the matching step files plus the always-load set (hooks, context classes, anything
   with load-time side effects), falling back to a full load on any unresolved pattern.
1. Expose `reloadSupport()` through the CLI as a watch mode. The delta-aware eviction logic already
   exists in [load-support.ts:96-149](cucumber-tsflow/src/api/load-support.ts#L96-L149) but has no
   command-line surface. A long-lived process keeps the transpiled modules, the `ts-node` service
   and the resolution caches hot, which reduces the second and every subsequent run to nothing.

## A cheap experiment worth running early

Node 22.8+ exposes `module.enableCompileCache()`, which persists V8 bytecode for CJS and ESM
modules to disk. Since the package already requires Node >= 22, calling it (guarded) at the top of
the CLI is a few lines. It attacks a different cost than the transpile cache — V8 parse and compile
rather than TypeScript-to-JavaScript — and the two compose.

The caveat is that its interaction with sources produced by custom loaders is not something to
assume; it should be measured with the Step 0 instrumentation rather than adopted on faith. But
given the size of the module graph involved, it is worth an hour.
