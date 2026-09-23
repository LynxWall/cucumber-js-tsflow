# Phase 5 hand-off

Part of the [Performance Enhancement Execution Strategy](../performance-enhancement-execution-strategy.md).

Written at the end of the Phase 5 session so that the Phase 6 session can start cold.

## State of the tree

- Still on branch `2026-09-performance-enhancements`. Phase 4 was committed as `b2e9383` ("phase 4: lazy
  callsites, soure mapping") and the core of Phase 5 as `abf6b0d` ("update esm hook mechanics"). The
  follow-up removal of `esbuild-transpiler.mjs`, its build script and `exports` entry (see item 18 below)
  and the `research/` directory were **uncommitted** at the time of writing; check `git log` and
  `git status` before assuming either way.
- `yarn build` clean, no stray `.js` under `src/`; `yarn test:all` green on all sixteen variants. In addition,
  because this phase adds a second registration mechanism, two things the matrix does not cover were run by
  hand and were green: `TSFLOW_ESM_HOOKS=async yarn test:esm` (the four ESM variants on the `module.register()`
  fallback with the rewritten hooks) and `cucumber-tsflow -p esnodeesm --parallel 2` / `-p esvue-esm --parallel 2`
  in `node-esm` and `vue-esm` (in-thread hooks inside parallel child processes; every esbuild ESM spec profile
  is serial). ESLint and Prettier clean on every changed file.
- Files changed: new `src/api/register-loaders.ts`; `src/api/support.ts`, `src/api/loader-worker.ts` and
  `src/runtime/parallel/worker.ts` now call `registerLoader()` instead of `register()` directly;
  `src/transpilers/esm/loader-utils.mjs` (rewritten, all helpers synchronous, ts-node removed),
  `esnode-loader.mjs`, `esvue-loader.mjs` (export `resolve`/`load`/`initialize` only), `tsnode-loader.mjs`
  and `vue-loader.mjs` (adapted to the synchronous helpers, otherwise unchanged and still on `register()`);
  `src/transpilers/esm/tsnode-service.mjs`, `src/transpilers/esm/esbuild-transpiler.mjs` and
  `src/scripts/build-esm-transpiler-cjs.js` deleted, with the matching `exports` entry and `build:transpiler`
  script removed from `package.json`; `src/utils/tsflow-timing.ts` / `.mjs` header comments; build notes in
  `CLAUDE.md`, `.github/copilot-instructions.md` and the `pnpm-link-consumer` skill. Docs:
  `CHANGELOG.md` (three earlier `[Unreleased]` entries about the esbuild loaders' ts-node service were
  rewritten rather than contradicted, since nothing has shipped), `Architecture.md` (Diagnostics table,
  Transpilers, new "ESM loader registration", "ESM loader caches"), `README.md` (new "ESM loader hooks"),
  `src/transpilers/esm/README.md`.
- The UIS Tools VueApp link (`pnpm-link-consumer` skill) was in place throughout and was not changed.

## What Phase 5 landed

- **The 18/21 decision.** Synchronous hooks won. `module.registerHooks()` removes a `postMessage` round trip
  per `resolve` and per `load` and a structured clone per load result for _every_ module the thread imports,
  support files and dependency graph alike; item 18's async `esbuild.transform()` could only have overlapped
  the esbuild calls themselves, whose total (`transpile ms`) was already under 1 s on the `dim` profile in
  Phase 4. In-thread hooks must be synchronous, so the async half of item 18 is dropped, not deferred: it
  cannot coexist with this design. Its other half — bypassing ts-node — landed in full.
- **Item 21.** `registerLoader(specifier)` in `src/api/register-loaders.ts` is the one place the three
  registering contexts (main `getSupportCodeLibrary`, preload worker, parallel child) attach a loader. For
  tsflow's own `esnode-loader` / `esvue-loader` (recognised by the `/transpilers/esm/<name>` suffix of the
  specifier) on a Node with `module.registerHooks` (22.15 / 23.5+), it `import()`s the `.mjs` by path
  relative to `lib/api` and passes `{ resolve, load }` to `registerHooks()`, deduplicated per thread because
  hooks stack. Everything else — the ts-node loaders, third-party loaders in the `loader` list, older Node,
  or `TSFLOW_ESM_HOOKS=async` — goes through `register(specifier, pathToFileURL('./'), timingRegisterOptions())`
  exactly as before. No `engines` bump: the fallback is the runtime alternative the item's scope allowed.
  `@types/node` 22.13 does not declare `registerHooks`, hence the cast. The dynamic `import()` from the CJS
  build is emitted natively because the base tsconfig uses `module: node18`; no `require(esm)` is involved.
- **Synchronous hooks see `require()`.** Verified with a probe on Node 24.16: `registerHooks` hooks are
  invoked for every `require()` on the thread with `context.conditions` containing `'require'` (and no
  `'import'`), while `register()` hooks never see `require()` at all. Without a guard, the extension probe
  would have returned `{ url: '.../foo.js', format: 'module', shortCircuit: true }` for tsc's extensionless
  `require('./foo')` inside `lib/` and broken every CJS load. `isRequire(context)` in `loader-utils.mjs`
  short-circuits those to `nextResolve`/`nextLoad` at the top of both hooks. The same probe confirmed
  `registerHooks` is thread-local (a worker's registration is invisible to the main thread), so preload
  workers register their own hooks as they always did, and that `nextResolve('./x.ts')` returns
  `format: null` on 24.16, so the `format: 'module'` our `load` returns is what decides.
- **Dual-mode hooks.** The esbuild loaders' `resolve`/`load` are plain synchronous functions that also work
  under `register()`: every helper is synchronous, sources are read with `readFileSync` rather than via
  `nextLoad`, and the hooks return whatever `nextResolve`/`nextLoad` return without inspecting it (a value
  in-thread, a promise on the hooks thread). One consequence to be aware of: a consumer loader listed
  _after_ ours in `loader` can no longer transform the raw `.ts`/`.vue`/`.json` source before we see it,
  because we never call `nextLoad` for those; ts-node's `load` used to. No spec or known consumer chains
  loaders that way.
- **Item 18.** `loadTypeScript(url)` reads the file and calls `transpileCode(code, filename, undefined,
  { esbuild: { sourcemap: 'inline' } })` from `esbuild.mjs` — the `_options.esbuild` spread already existed,
  so `esbuild.mjs` did not change. ts-node is gone from the esbuild loaders entirely: `tsnode-service.mjs`
  (which `require`d `ts-node-maintained` at loader initialisation, before any TypeScript file) is deleted,
  along with `getEsmHooks`, `createHookExports` and the `tsNodeHooks`/`getTsNodeHooks`/`handleTsFiles`
  options of `resolveSpecifier`. Explicit `.ts`/`.tsx` specifiers now fall through to Node's resolver (ts-node's
  was only ever consulted for specifiers that already carried the extension, where the two agree).
  `tsnode-loader.mjs` keeps its ts-node fallback resolve and applies the `format: 'module'` override for
  `.ts`/`.tsx` specifiers itself, preserving the old step-2 behaviour. `esbuild-transpiler.mjs`, its
  bundled `esbuild-transpiler-cjs.js`, the `src/scripts/build-esm-transpiler-cjs.js` script, the
  `build:transpiler` step and the `exports` entry were removed too, on the owner's decision: the ts-node
  `Transpiler` plugin was public surface, but no tsflow loader used it any more and no known consumer
  referenced it. `yarn build` is now `genversion` + `tsc --build` + the `.mjs` copy, and `src/scripts/`
  no longer exists.
- **Timing report shape.** In-thread loaders record `esm:hooks-init`, `esm:resolve` and `esm:load` into the
  registering thread's store, so on the spec workspaces those rows now sit under "Main process" and each
  `preload:<n>`, and the "Main process ESM loader hooks" section appears only under `TSFLOW_ESM_HOOKS=async`
  or for the ts-node loaders. `collectLoaderTimings()` resolves immediately when no port was handed out.
  `esm:hooks-init` for an esbuild loader is now the `import()` of the loader module (esbuild, tsconfig-paths,
  the logger/timing twins): 91 ms in the main process on `node-esm`, where Phase 3 measured 128–141 ms for
  ts-node service creation on the hooks thread.

## Measured effect on the large suite

UIS Tools `dim` profile (324 scenarios, 1363 steps, `es-vue-esm`, experimental decorators, serial),
`TSFLOW_TIMING=true`, same build, same machine and session, all runs green. This is a true A/B on one build:
**sync** rows are the default (`module.registerHooks()`, hooks in the main thread), **async** rows set
`TSFLOW_ESM_HOOKS=async` (`module.register()`, hooks on the loader thread — the Phase 4 mechanism, but with
item 18's ts-node bypass in both). Runs sync 1–4 and async 1–3 were taken back to back after `yarn build`;
sync 5–7 and async 4–5 were interleaved afterwards (s5, a4, s6, a5, s7) to control for drift. Run 1 was the
cold run after the build. Sync runs 2 and 4 were disturbed by the machine (run 4 recorded a 34.7 s
`bootstrap` and a 6.3 s `esm:hooks-init` for work that takes 0.4 s and 0.08 s in every other run) and are
shown struck out of the comparison, not hidden. `esm:*` rows for sync come from the main-process table; for
async from the "Main process ESM loader hooks" table. Async has no `esm:hooks-init` row because the esbuild
loaders no longer create a ts-node service and nothing else on the hooks thread is timed at initialisation.

| Mode  | Run | `bootstrap` ms | `esm:hooks-init` ms | `esm:resolve` ms (2828) | `esm:load` ms (920) | `support:import` ms | `runtime:run` ms | Wall  |
| ----- | --- | -------------- | ------------------- | ----------------------- | ------------------- | ------------------- | ---------------- | ----- |
| sync  | 1 (cold) | 757       | 113                 | 3802                    | 27968               | 102585              | 83865            | 196 s |
| sync  | 2 (disturbed) | 518  | 195                 | 2190                    | 1707                | 6493                | 61888            | 76 s  |
| sync  | 3   | 429            | 92                  | 703                     | 966                 | **3070**            | 39723            | 50 s  |
| sync  | 4 (disturbed) | 34740 | 6339               | 3225                    | 36101               | 126697              | 38278            | 256 s |
| sync  | 5   | 404            | 87                  | 681                     | 965                 | **3041**            | 37381            | 49 s  |
| sync  | 6   | 431            | 80                  | 653                     | 922                 | **2957**            | 38664            | 48 s  |
| sync  | 7   | 392            | 76                  | 646                     | 939                 | **2906**            | 46566            | 55 s  |
| async | 1   | 410            | —                   | 723                     | 911                 | **3206**            | 36865            | 47 s  |
| async | 2   | 434            | —                   | 743                     | 948                 | **3392**            | 37061            | 46 s  |
| async | 3   | 400            | —                   | 714                     | 935                 | **3260**            | 36804            | 46 s  |
| async | 4   | 415            | —                   | 729                     | 933                 | **3356**            | 37362            | 47 s  |
| async | 5   | 511            | —                   | 895                     | 1114                | **3981**            | 37808            | 48 s  |

Conclusions:

1. **Items 18 and 21 together are worth about 0.3 s of a 3.2–3.4 s warm startup on this profile, roughly
   10%.** The four clean sync runs put `support:import` at 2.9–3.1 s; the five async runs, same build, put it
   at 3.2–4.0 s (3.2–3.4 s excluding async 5). The hooks' own execution barely moved (`esm:resolve`
   0.65–0.70 s vs 0.71–0.90 s, `esm:load` 0.92–0.97 s vs 0.91–1.11 s), which is what item 21 predicts: the
   cost it removes is the round trip _around_ each hook call, and that shows up only as the difference
   between `support:import` and the sum of its parts. About 4.2 k hook invocations at roughly 70 µs of
   thread hop apiece is the 0.3 s.
1. **Wall clock cannot resolve this.** `runtime:run` was 37.4–46.6 s across the clean sync runs and
   36.8–37.8 s across async, a spread an order of magnitude larger than the startup difference; the
   48–55 s versus 46–48 s wall clocks are that noise, not a regression (nothing in Phase 5 touches the
   per-step path).
1. **Against Phase 4 (`support:import` 3.7–4.6 s, `esm:load` 1.0–1.3 s, `esm:hooks-init` 128–141 ms in
   Phase 3), startup on this profile is now 2.9–3.1 s.** Part of that gap is item 18 (the async rows above
   already include it and sit below Phase 4's numbers), part is item 21, and part is session-to-session
   variance; the within-session A/B above is the only attribution that should be trusted.
1. The remaining 2.9 s is ~1.6 s of hook execution (esbuild transpile plus resolution for 920 loads and
   2828 resolves) and ~1.3 s of genuine module evaluation. Item 16's on-disk cache attacks the transpile
   share of the 0.93 s `esm:load`; Phase 6 should be scoped against that figure, as the Phase 4 notes
   already said.

## Notes specific to Phase 6

- Phase 6 (items 16, 17, 22, 15) builds the content-addressed cache into the `load` hook. For the esbuild
  loaders that hook is now `loadTypeScript()` / `loadVue()` in `loader-utils.mjs`, running synchronously on
  the importing thread, so cache reads and writes must be synchronous `fs` calls; that is natural for an
  on-disk cache and rules nothing out. The ts-node loaders are unchanged and still asynchronous on the hooks
  thread, so a cache that must cover them too needs both call shapes.
- Item 22 (concurrent `import()` of support files) should be re-rated before Phase 6 commits to it: with
  in-thread hooks, `load` blocks the importing thread while esbuild runs, so concurrent `import()` calls
  cannot overlap transpilation any more; whatever it recovers is module-evaluation overlap only.
- Item 17 (preload transpiles into the cache): preload workers now run the esbuild hooks in their own
  thread as well, so "transpile in the worker, read from the cache on the main thread" has no thread hop in
  either direction. Re-read `origin/Dev-Prebuild` ("Remove parallel load support", flagged in the Phase 1
  hand-off and still unexamined) before spending effort here.
- **ESM callsite source mapping (the unrated correctness item from the Phase 4 notes) was not done**, but
  this phase removes its structural blocker for the esbuild loaders: the transpiled output with its inline
  map (`sources: [<absolute .ts path>]`) is now produced on the same thread that later resolves callsites.
  The enabling change is small — `loadTypeScript()` records `url → map` on a `globalThis` map and
  `Callsite.resolve()` in `our-callsite.ts` consults it before `sourceMapSupport.wrapCallSite` — but decoding
  the map needs either `source-map` (already installed transitively under `source-map-support`, not a direct
  dependency; adding one is the owner's call) or a hand-written VLQ decoder. `sourceMapSupport.install({
  retrieveSourceMap })` stays rejected for the Phase 4 reasons. The ts-node loaders would still report raw
  positions unless the map crosses the `MessageChannel`.
- With the hooks in-thread, Node's `esm:resolve`/`esm:load` rows measure the hooks' own execution as before,
  but the message round trips they used to sit behind are gone, so a fall in `support:import` that is
  larger than the fall in `esm:*` is expected and is the point of item 21.
- Prettier's `endOfLine: crlf` applies to everything under `cucumber-tsflow/src`; the Write tool and
  heredocs produce LF, so run `prettier --write` on touched files before judging the diff.
- Build with `yarn build`, never bare `tsc`; run `yarn test:all` before calling the phase done; take at
  least three runs per build on the UIS profile and discard run one.
