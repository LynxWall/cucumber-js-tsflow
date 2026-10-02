# Phase 4: lazy callsites, and the 20 seconds hiding inside `support:import`

This document explains one change set in `@lynxwall/cucumber-tsflow` and the discovery it led to. It starts
from first principles so that someone new to the codebase can follow it, and gets progressively more
specific. The short version comes first; each later section adds a layer.

## 1. The short version

Every `@given`, `@when`, `@then` and hook decorator records _where in the source it was written_, so that
reports and error messages can point at a file and line. Until this change, working that out was done
eagerly, at the moment each decorator ran, by asking the `source-map-support` library to translate a stack
frame back to the original TypeScript position.

In any test suite that sets up jsdom (every Vue suite, because our own `es-vue-esm` transpiler installs
jsdom globals), `source-map-support` decided it was running _inside a browser_ and fetched each source file
with a **synchronous `XMLHttpRequest`**. jsdom implements a synchronous XHR by **spawning a separate Node
process** and waiting for it. That is roughly 0.7 seconds per support file, paid once per file, on every
run, since the day decorators started capturing callsites.

On the UIS Tools `dim` profile (34 step-definition files) this was about 20 of the 24 seconds of startup.
On the full `default` profile (208 step files) it was the difference between a nine-minute and a
three-minute run.

The fix is small: resolve callsites lazily, after loading, and hide the `XMLHttpRequest` global from
`source-map-support` for the duration of each lookup so it takes its file-system path instead. Reported
file names and line numbers are unchanged.

## 2. Background a junior developer needs

### 2.1 What a "callsite" is and why we keep one

A step-definition file looks like this:

```typescript
@binding()
export default class BasketSteps {
	@given('I have an empty basket') // <- line 12
	emptyBasket(): void {
		/* ... */
	}
}
```

When CucumberJS reports on a run (the HTML report, the JSON report, the `usage` formatter, an "ambiguous
step" error), it wants to say _which file and line_ defines each step. CucumberJS's own `Given(...)`
function works this out by looking at the stack trace at the moment `Given` is called. In cucumber-tsflow
the user never calls `Given`; the decorator does, later, from inside library code. So the library has to
capture the location itself, at the moment the decorator factory `given('...')` runs, and hand it to
CucumberJS afterwards. That captured location is what the code calls a `Callsite`.

Two places consume it:

- `BindingRegistry.updateSupportCodeLibrary()` copies each binding's `filename` and `lineNumber` onto the
  matching CucumberJS definition (`uri` and `line`) after all support code has loaded. Formatters read
  those.
- `bindStepDefinition()` prints `callsite.toString()` in the error message when more than one binding
  matches a step (an ambiguity).

### 2.2 When decorators run

A decorator is just a function call that happens while the module is being _evaluated_, i.e. while Node is
executing the top level of the file for the first time. If a file has forty decorated methods, forty
factory calls happen during that one `import`. A suite with 200 step files and 3,000 bindings runs the
factory 3,000 times before the first scenario starts. Anything the factory does is therefore on the
startup critical path and is multiplied by the number of bindings.

### 2.3 Source maps and `source-map-support`

TypeScript is transpiled to JavaScript before Node runs it. Line 12 in the `.ts` file might be line 15 (or
line 40, if the decorator is emitted at the end of the class) in the generated JavaScript. A **source map**
is the table that translates generated positions back to original ones.

Node's stack traces report positions in the code it actually ran, i.e. the generated JavaScript. The
`source-map-support` package exists to fix that up: given a stack frame, `wrapCallSite(frame)` finds the
source map for that frame's file and returns a frame whose `getFileName()` and `getLineNumber()` answer in
original-source terms. To find the map it has to read the generated file (or be told where it lives) and
look for a `//# sourceMappingURL=` comment.

`source-map-support` also has a browser mode. It decides which mode it is in like this
(`source-map-support.js`, function `isInBrowser`):

```javascript
return typeof window !== 'undefined' && typeof XMLHttpRequest === 'function' && !(/* Electron renderer check */);
```

In browser mode it cannot read files, so it fetches them with a **synchronous** `XMLHttpRequest`. That code
path is the whole story of this document.

### 2.4 jsdom, and why a Node test process looks like a browser

Vue component tests need a DOM. jsdom provides one in Node, and the common way to use it is `jsdom-global`,
which copies `window`, `document`, `XMLHttpRequest` and many other browser globals onto Node's global
object. cucumber-tsflow's `es-vue-esm` and `ts-vue-esm` transpilers load `vue-jsdom-setup.mjs`, which does
exactly that, before any support file is imported.

So in a Vue suite, `typeof window !== 'undefined'` and `typeof XMLHttpRequest === 'function'` are both true
in the main Node process. `source-map-support` concludes it is in a browser.

jsdom implements a synchronous XHR the only way Node allows: `XMLHttpRequest-impl.js` calls
`child_process.spawnSync` on a helper script (`xhr-sync-worker.js`), which performs the request in a fresh
Node process and hands the result back. Spawning Node costs a few hundred milliseconds. For a `file://`
URL on Windows the request does not even succeed, but the process is spawned regardless.

### 2.5 The two timing phases that matter

`TSFLOW_TIMING=true` makes cucumber-tsflow print a table of startup phases. Two of them appear throughout
this document:

- `support:import` — the time to `import()` every support file. This includes transpiling, evaluating the
  module, and everything the decorators do while the module evaluates.
- `registry:update` — the time `BindingRegistry.updateSupportCodeLibrary()` takes to copy binding metadata
  (including callsite file and line) onto the CucumberJS definitions. Before Phase 4 this was 0.6 ms on the
  UIS `dim` profile.

## 3. What Phase 4 changed in the callsite code

### 3.1 Before

`src/utils/our-callsite.ts` did all of its work inside `capture()`, which every decorator factory called:

```typescript
public static capture(): Callsite {
	const stack = Callsite.callsites()[2] as unknown as CallSite; // full stack walk, prepareStackTrace swapped
	const tsStack = sourceMapSupport.wrapCallSite(stack);        // source-map resolution, right now
	const ourCallsite = new Callsite(tsStack.getFileName() || '', tsStack.getLineNumber() || -1);
	ourCallsite.filename = ourCallsite.filename.replace(`${this.cwd}\\`, ''); // Windows-only separator
	return ourCallsite;
}
```

Three costs per binding, all during module evaluation: a full-depth structured stack capture, the
`Error.prepareStackTrace` swap, and the `wrapCallSite` call. `wrapCallSite` caches its source-map lookup
per file, so the expensive part is once per _file_ rather than per binding; that turns out to matter for
how the cost hid.

### 3.2 After

`capture()` now only takes the raw frame, and takes as few frames as possible:

```typescript
public static capture(): Callsite {
	const previousLimit = Error.stackTraceLimit;
	const previousPrepare = Error.prepareStackTrace;
	Error.stackTraceLimit = CAPTURE_DEPTH; // 3: capture(), the decorator factory, the support file
	Error.prepareStackTrace = (_, stack) => stack;
	const stack = new Error().stack as unknown as CallSite[] | undefined;
	Error.prepareStackTrace = previousPrepare;
	Error.stackTraceLimit = previousLimit;
	return new Callsite(stack?.[CAPTURE_DEPTH - 1]);
}
```

`filename` and `lineNumber` became getters. The first read of either runs `wrapCallSite` and memoizes the
answer; nothing reads them until `updateSupportCodeLibrary()` runs after every support file has loaded.

One consumer had to change for laziness to be real. `BindingRegistry.registerStepBinding()` detects
duplicate registrations (the same file evaluated twice, for example by `reloadSupport()`) with a key that
used to include the mapped `filename` and `lineNumber`; building that key would have forced resolution
during load. The key now uses `callsite.rawPosition`, the `file:line:column` of the code V8 actually ran.
Two different decorator expressions can never share a raw position, and the same expression evaluated
twice always does, so duplicate detection is unchanged in practice.

The path-relativizing now uses `path.sep`, so Linux and macOS produce cwd-relative `uri`s like Windows
always has. This is the only intentional behavior change in the callsite code.

Microbenchmark (plain Node, 30-deep stack, 5,000 iterations): the old `capture()` costs 21.5 µs, the new
one 6.0 µs, and the deferred resolution 6.1 µs per binding when it eventually runs. Modest — this was
never where the seconds were.

## 4. The finding

### 4.1 Where `registry:update` fits: the smoking gun, not the cause

The first timed run of the lazy build on the UIS `dim` profile produced this (warm run, ms):

| Phase             | Phase 3 build | Phase 4, lazy callsites only |
| ----------------- | ------------- | ---------------------------- |
| `support:import`  | 25 807        | 4 807                        |
| `registry:update` | 0.4           | 20 803                       |

Twenty seconds left `support:import` and reappeared, almost to the millisecond, in `registry:update`. That
is exactly what deferring the resolution predicts: the `wrapCallSite` calls that used to run inside each
`import()` now run in one batch inside `updateSupportCodeLibrary()`. It is also what made the cost visible
at all. Spread across 34 files during import, interleaved with genuine transpiling and evaluating, 0.6
seconds per file just looked like slow modules; the Phase 3 hand-off had concluded the remaining startup
time was "module evaluation of ~200 support files plus their dependency graph". Concentrated into one phase
that had a 0.6 ms history, it was obviously wrong.

So `registry:update` is where the cost was _caught_. The cause is the chain below.

### 4.2 The chain, step by step

1. `updateSupportCodeLibrary()` reads `stepBinding.callsite.lineNumber` for the first binding in a file.
1. The getter calls `sourceMapSupport.wrapCallSite(frame)`.
1. `wrapCallSite` calls `mapSourcePosition({ source, line, column })`. `source` is the frame's file name,
   which under the ESM loaders is a `file:///C:/...ts` URL.
1. `mapSourcePosition` has no cached map for that source, so it calls `retrieveSourceMap(source)`.
1. The default handler is `retrieveSourceMapURL(source)`. Its first line is `if (isInBrowser())`.
1. `isInBrowser()` sees `window` and `XMLHttpRequest` on the global object (jsdom) and returns `true`.
1. It constructs jsdom's `XMLHttpRequest`, calls `open('GET', source, false)` — `false` means synchronous —
   and `send()`.
1. jsdom's `XMLHttpRequest-impl.js` handles a synchronous send with `spawnSync(process.execPath,
   [xhr-sync-worker.js, ...])`: a new Node process starts, attempts the request, exits.
1. The request fails (it is a `file://` URL; jsdom treats it as a cross-origin fetch). The catch block
   swallows it and the function falls through to `retrieveFile(source)`, which reads the file with `fs` and
   finds no `sourceMappingURL` comment (the file on disk is the `.ts` source; the transpiled output with
   its inline map lives on the loader-hooks thread).
1. `mapSourcePosition` caches "no map for this source" and returns the position unchanged.
1. Every other binding in the same file hits the cache. The next file repeats steps 4–10.

Net effect: one spawned process per support file, for nothing, on every run.

### 4.3 Reproduction outside cucumber-tsflow

The mechanism reproduces in a dozen lines with no cucumber code involved. Both measurements use
`source-map-support` 0.5.21 and `jsdom-global` from this repository's `node_modules`, seven `file://` frames
each:

| Condition                                       | `wrapCallSite` cost per file |
| ----------------------------------------------- | ---------------------------- |
| Plain Node, no jsdom globals                    | 0.3 ms                       |
| After `require('jsdom-global')()`               | 680 ms                       |

The script is in appendix A. 680 ms × 34 step files ≈ 23 s, which is the number that appeared in
`registry:update`.

### 4.4 Why CommonJS suites were not affected

In CJS mode the transpilers register `ts-node`, and ts-node installs its own fork of the library,
`@cspotcode/source-map-support`, with `environment: 'node'` — which makes `isInBrowser()` return `false`
unconditionally. It also hooks `Module._resolveFilename` so that any later `require('source-map-support')`
— including ours in `our-callsite.ts` — is silently redirected to that already-installed fork. Two
consequences:

- CJS callsites are correctly source-mapped (TypeScript line numbers in reports) because ts-node's fork
  knows where the transpiled output and its inline map are.
- CJS suites never took the browser path, jsdom or not.

In ESM mode the transpilation happens on Node's loader-hooks thread. ts-node is created there, not in the
main thread, so nothing redirects our `require('source-map-support')`: we get the plain package with
`environment: 'auto'`, and auto-detection sees jsdom. This is why the problem was specific to
`es-vue-esm` and `ts-vue-esm`, and why it did not show up in the CJS Vue spec workspaces.

A side observation, recorded for Phase 5: because the main thread never has access to the transpiled
output, ESM callsites have _always_ been reported as `file://` URLs with compiled line numbers (the spec
reports show TypeScript line 50 reported as 53 under esbuild, 52 as 55 under ts-node). Phase 4 preserves
that exactly. Making it correct is a separate, unrated correctness item.

### 4.5 Why nobody noticed

- The cost is per support file, not per binding, and it hid inside `support:import`, which everyone
  expected to be large. Per-file timing showed `evaluate` time on each step file and that was accepted as
  "this file imports heavy Vue components".
- It only occurs with the ESM Vue transpilers, which are the newest and least measured configuration.
- It is proportional to file count, so it grew quietly as the UIS suite grew from a handful of step files
  to 208.
- Nothing fails. The XHR errors are caught and discarded; the fallback produces the same answer the
  successful path would have.

## 5. The fix

`our-callsite.ts` wraps each `wrapCallSite` call:

```typescript
function withoutBrowserDetection<T>(fn: () => T): T {
	const globals = globalThis as { window?: unknown; XMLHttpRequest?: unknown };
	if (typeof globals.window === 'undefined' || typeof globals.XMLHttpRequest !== 'function') {
		return fn(); // not a jsdom process; nothing to do
	}
	const descriptor = Object.getOwnPropertyDescriptor(globals, 'XMLHttpRequest');
	if (!descriptor?.configurable) {
		return fn(); // cannot remove it; accept the library's behavior
	}
	delete globals.XMLHttpRequest;
	try {
		return fn();
	} finally {
		Object.defineProperty(globals, 'XMLHttpRequest', descriptor);
	}
}
```

`wrapCallSite` is synchronous, so no other code can observe the missing global. With it gone,
`isInBrowser()` returns `false`, `retrieveSourceMapURL` skips straight to `retrieveFile`, and the result is
identical to what the XHR path produced after its failure — including for a consumer whose ESM support
files _do_ carry source maps, since the file-system lookup is the path that finds them.

Two alternatives were considered and rejected:

- **`sourceMapSupport.install({ environment: 'node' })`** would set the mode properly, but `install()` also
  sets `Error.prepareStackTrace` and flips a one-shot `errorFormatterInstalled` flag. Restoring
  `prepareStackTrace` is easy; the flag is not, and it would silently disable a consumer's own later
  `source-map-support/register` on the same module instance.
- **Skipping `wrapCallSite` for `file://` frames** is simpler and today gives the same answer, but it would
  remove source mapping for a consumer who prebuilds ESM support files with real source maps. The chosen
  fix keeps their behavior.

## 6. Measured effect

UIS Tools `dim` profile: 324 scenarios, 1,363 steps, 34 step files, `es-vue-esm`, experimental decorators,
serial. `TSFLOW_TIMING=true`, same machine and session. "Startup" is `support:import` + `registry:update`.
Run 1 after each rebuild (cold OS cache and antivirus, 128–219 s) is omitted.

| Build                              | `support:import` | `registry:update` | Startup | Wall  |
| ---------------------------------- | ---------------- | ----------------- | ------- | ----- |
| Phase 3 (before)                   | 24.2–29.1 s      | 0.4–0.9 ms        | 24–29 s | 77–124 s |
| Phase 4, lazy callsites only       | 4.7–5.1 s        | 19.8–21.2 s       | 25–26 s | 83–92 s  |
| Phase 4, lazy + browser-detection fix | 3.7–4.6 s     | 9–19 ms           | 3.8–4.6 s | 56–61 s |

What remains in `support:import` (about 4 s) is genuine module evaluation: `test-setup.mjs` at 0.8 s and
the Vue component graphs behind the step files.

The wall-clock column is noisier than it should be. The Phase 3 baseline's `runtime:run` (the scenarios
themselves, which Phase 4 does not touch) ranged 43–86 s across three warm runs in this session because
the machine was busy; Phase 3's own session measured 39–41 s. Compare startup columns, not wall clock, when
reading this table. The full-profile figure the user observed independently — roughly nine minutes to
three — is the same effect scaled from 34 step files to 208.

## 7. The other Phase 4 items, briefly

These landed in the same change set and are documented in `CHANGELOG.md` and `Architecture.md`. Their
measured effect is small; they are listed so the diff is fully accounted for.

- **No re-glob in parallel children (item 10).** The coordinator already expands the `require`/`import`
  globs; it now sends the resolved lists in the `INITIALIZE` message (`resolvedSupportPaths`) and the child
  uses them instead of calling `resolvePaths` again. Measured saving: 2–9 ms per child on a warm cache,
  even for the 209-file `default` profile.
- **V8 compile cache (item 14).** `bin/cucumber-tsflow.js` calls `module.enableCompileCache()` and exports
  the directory as `NODE_COMPILE_CACHE` so forked children and worker threads share it (Node does not
  export it itself). Measured neutral on this profile: `bootstrap` 397–438 ms with, 397–402 ms without.
  Kept because it is free and Node-governed (`NODE_DISABLE_COMPILE_CACHE=1` turns it off), flagged for the
  maintainer as a keep-or-drop decision.
- **`@lynxwall/cucumber-tsflow/bindings` entry point (item 20).** Decorators, context classes and CucumberJS
  support-code helpers without formatters, snippet syntax or CLI: 239 modules against the root's 540. The
  root itself dropped from 593 to 540 modules by constructing the deprecated `Cli` lazily, and
  `binding-decorator.ts` now takes `Given`/`Before`/… from `supportCodeLibraryBuilder.methods` rather than
  the `@cucumber/cucumber` root barrel (456 modules on its own). One spec file per workspace uses the new
  entry point.

## 8. What to tell consumers

- Affected: any suite using `es-vue-esm` or `ts-vue-esm` (or otherwise having jsdom globals in the main
  process while using an ESM transpiler). Expect startup to fall by roughly 0.6–0.7 s per step-definition
  file.
- Not affected: CJS transpilers (`es-node`, `ts-node`, `es-vue`, `ts-vue`) and non-jsdom ESM suites.
- No configuration change is needed. No report output changes on Windows; on Linux and macOS, step
  definition `uri`s become relative to the working directory, matching Windows and CucumberJS's own
  convention.

## 9. Open items this work surfaced

- ESM callsite positions are compiled-line positions with `file://` URLs, and always have been. Fixing it
  requires the main thread to obtain the inline source map from the loader-hooks thread (the timing
  plumbing already has a `MessageChannel` between them) or to enable Node source maps and use
  `module.findSourceMap()`. Belongs with the Phase 5 hook work.
- The Phase 3 hand-off's conclusion that the remaining startup cost was "module evaluation" is corrected in
  the execution-strategy document. Phases 5–9 were justified partly on that reading and should be re-scoped
  against the new ~4 s figure.
- `IMessageData.coordinates` is still sent to parallel children and no longer read by them.
- The `vue-esm` and `vue-exp-esm` spec workspaces both write `reports/esvue.*`, so those two variants
  cannot be diffed before/after by report.

## 10. Verifying it yourself

Time a run and look at the two phases:

```bash
TSFLOW_TIMING=true npx cucumber-tsflow -p dim 2>&1 | grep -E "support:import|registry:update"
```

Show the mechanism in isolation (appendix A):

```bash
node repro-xhr.js
```

Confirm the reported locations did not change: run a profile before and after, then compare the
`sourceReference` values embedded in the HTML report.

```bash
grep -o '"sourceReference":{[^}]*}[^}]*}' reports/esvue.html | sort -u > after.txt
```

## Appendix A: reproduction script

```javascript
// repro-xhr.js — run from the cucumber-js-tsflow repository root
const { pathToFileURL } = require('node:url');
const fs = require('node:fs');
const sms = require('source-map-support');

const dir = 'cucumber-tsflow/src/bindings/';
const files = fs.readdirSync(dir).map(f => pathToFileURL(dir + f).href);

// The subset of V8's CallSite interface that wrapCallSite touches
function frameFor(source) {
	return {
		isNative: () => false,
		getFileName: () => source,
		getScriptNameOrSourceURL: () => source,
		getLineNumber: () => 10,
		getColumnNumber: () => 5,
		isEval: () => false,
		getFunctionName: () => 'x',
		getTypeName: () => null,
		getMethodName: () => null,
		isToplevel: () => true,
		isConstructor: () => false,
		getEvalOrigin: () => null,
		getThis: () => undefined,
		getFunction: () => undefined,
		toString: () => ''
	};
}

function time(label, sources) {
	const t = process.hrtime.bigint();
	for (const s of sources) sms.wrapCallSite(frameFor(s));
	const ms = Number(process.hrtime.bigint() - t) / 1e6 / sources.length;
	console.log(label.padEnd(44), ms.toFixed(1), 'ms per file');
}

time('plain node, file:// frames', files);
require('jsdom-global')();
console.log('typeof window =', typeof window, '; typeof XMLHttpRequest =', typeof XMLHttpRequest);
time('jsdom globals present, file:// frames', files.map(f => f + '?again')); // new cache keys
```

## Appendix B: glossary

- **Callsite** — the file and line at which a decorator was applied; captured by `Callsite.capture()`.
- **Decorator factory** — the function call `given('pattern')` that returns the actual decorator; runs
  during module evaluation.
- **Source map** — a table mapping positions in generated JavaScript back to the original TypeScript.
- **`source-map-support`** — an npm package that rewrites stack frames through source maps. ts-node uses
  a fork, `@cspotcode/source-map-support`, and redirects `require('source-map-support')` to it.
- **jsdom / `jsdom-global`** — a DOM implementation for Node, and the helper that installs its objects
  (`window`, `document`, `XMLHttpRequest`, …) as Node globals.
- **Loader-hooks thread** — the worker thread Node runs ESM `resolve`/`load` hooks on when a loader is
  registered with `module.register()`. cucumber-tsflow's ESM transpilers run there; the main thread never
  sees their output.
- **`support:import` / `registry:update`** — `TSFLOW_TIMING` phases: importing all support files, and
  copying binding metadata onto CucumberJS definitions afterwards.
