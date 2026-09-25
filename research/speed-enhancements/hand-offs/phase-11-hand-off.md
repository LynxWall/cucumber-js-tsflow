# Phase 11 hand-off

Part of the [Performance Enhancement Execution Strategy](../performance-enhancement-execution-strategy.md).

Written at the end of the Phase 11 session (2026-09-22) so that Phase 12 can start cold. Phase 11 was item 25,
the esbuild `build()` bundling prototype, and it is **closed without a prototype**: the only case left for it
after Phases 9 and 10 is the fresh-process full run, and that case has a ceiling of one to three seconds
against a four-minute CI run. The owner judged that below the bar for the most complex item on the list ("if
this saves five seconds of five minutes, the juice is not worth the squeeze"). No library code changed in this
phase; what follows is the measurement, the reasoning and the feasibility findings, recorded so that a future
attempt can start from them rather than from the rating.

## State of the tree

- Branch `2026-09-speed-enhancements`; Phase 10 ended at `43269ac` and nothing under `cucumber-tsflow/src`
  changed in this phase. `lib/` is a fresh `yarn build` of that commit (`7.7.2`), which is what the UIS link ran.
  This phase adds only this hand-off, the phased-plan entry above, and a paragraph in
  [local-consumer-testing.md](../testing/local-consumer-testing.md) about disturbed measurements.
- The console logs of the three measurement runs, each ending in its `TSFLOW_TIMING` report, are under
  `research/profiles/p11-bundling/startup-{1..3}.log` (gitignored, like every profile directory).
- The UIS Tools VueApp link is unchanged and must not be committed there.

## Method

Three fresh-process runs of the UIS `default` profile filtered to one scenario, from the UIS `test` directory:

```sh
TSFLOW_TIMING=true TSFLOW_THEME=off node ../node_modules/@lynxwall/cucumber-tsflow/bin/cucumber-tsflow.js \
  -p default --name "Loading indicator displays while reviews are loading"
```

`selectiveLoad` is off in that profile and `--watch` was not used, so the filter loads all 216 support files and
the startup rows are those of a full run while `runtime:run` stays under a second. Run 1 is the cold run after
`yarn build` and is discarded as always. The clean reference is the undisturbed fresh one-shot run of the same
filter and the same build lineage recorded in the [Phase 10 hand-off](phase-10-hand-off.md).

## What was measured

| Run | `bootstrap` | `gherkin` | `support:import` | `esm:resolve` (calls) | `esm:load` (modules) | `transpile-cache:hit` (files) | `runtime:run` | Wall clock |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 (cold, discarded) | 442 ms | 1932 ms | 182.3 s | 9.3 s (9407) | 77.5 s (2564) | — (968) | 892 ms | 187 s |
| 2 | 1235 ms | 360 ms | 18.6 s | 7.4 s (9407) | 3.3 s (2564) | — (968) | 793 ms | 24 s |
| 3 | 866 ms | 315 ms | 19.0 s | 7.7 s (9407) | 3.5 s (2564) | 978 ms (968) | 722 ms | 23 s |
| Phase 10 clean reference | 449 ms | 173 ms | 5.96 s | 2.31 s (9407) | 1.11 s (2564) | ~0.3 s (968) | 352 ms | 7.8 s |

Runs 2 and 3 are **disturbed, uniformly**: every phase is about three times the clean reference, including the
ones that do no module loading at all (`gherkin` 315–360 ms against 173 ms; 968 transpile-cache hits in 978 ms
against about 300 ms), which is the signature of the whole process being starved rather than of a regression in
one path. The cause was found and is worth recording because it is not the `bootstrap`-at-30-s pattern the
earlier notes describe: an orphaned Git Bash process, started the previous morning (2026-09-21 09:45), whose
parent shell had already exited, was scanning the entire disk and had accumulated 4.4 CPU-hours:

```text
"<Git for Windows>\usr\bin\find.exe" / -maxdepth 8 -iname common-library-3.1.0*.jar
```

Module loading is dominated by exactly the calls such a scan competes for (Phase 7's startup attribution:
`internalModuleStat`, `readFileUtf8`, `lstat`, `existsSync`, `readPackageJSON`). The machine sat at 64–65% CPU
throughout. The process was not killed during the session (it was not this session's) and the runs were not
retaken, because the decision below rests on the run's *structure* — the module counts, which are identical to
the clean reference — and on the clean reference's milliseconds, not on these.

## The ceiling

What bundling would remove, and what it would not, follows from counts that do not move with machine load:

- **2564 ES modules go through the loader hooks, of which 968 are project files** (the `transpile-cache:hit`
  count: 214 step files plus the `.vue` and `.ts` application sources they reach through 13 tsconfig aliases into
  `../tools/src`, which holds 531 `.vue` and 696 `.ts` files in total). The other **1596 are dependencies** —
  `vue`, PrimeVue, `@uis/testing-bdd`, `@testing-library/*` and their imports — which `packages: 'external'`
  leaves exactly as they are. Project modules are 38% of the ESM graph by count.
- **jsdom is outside bundling's reach entirely.** It is loaded by `require()` from `vue-jsdom-setup.mjs` under
  `support:require` (963 ms clean, about 500 CommonJS modules); the hooks hand `require()` straight to Node and a
  bundle of the support files would not touch it.
- **Upper bound.** If a bundle removed *every* cost of the 968 project modules — the resolve hook, the load hook,
  the cache read, and Node's own read, compile and link of each — the saving is bounded by roughly half of the
  clean 5.96 s `support:import`, about 3 s. Off that come the bundle's own read, compile and evaluation (one
  multi-megabyte module), and on a cache miss the `build()` itself, several hundred milliseconds for a thousand
  files. A realistic net is **1 to 3 s per fresh run**.
- **Denominators.** The full suite is 4 m 1 s clean (Phase 10; `support:import` was 5.13 s of it), so the saving
  is about **1% of a CI run**. On `dim` (about 40 s) it is at most 7%. In the inner loop it is nothing: a
  `--watch` rerun is 1.1 s and does not load the module graph, and `selectiveLoad` skips 683 of the 968 modules
  on a one-scenario run.

Set against the item's complexity — the highest on the list, for the correctness argument in
[item 25](../plan/ratings.md#25-esbuild-build-bundling-to-replace-per-file-transformsync) and the findings below — the owner closed
it. A measured rather than derived ceiling was offered (a throwaway bundle of the 216 support files timed against
the current loader, about an hour after the stray process is gone) and declined, since it is already the first
third of the prototype.

## Feasibility findings

Read from the source in this session, for whoever picks the item up again. They are ordered by how much each
would cost.

1. **Callsite mapping assumes one source per map.** `traceLoaderMap()` in `utils/our-callsite.ts` looks a
   frame's map up by module URL on `__CUCUMBER_TSFLOW_SOURCE_MAPS` and returns `fileURLToPath(url)` as the file
   name — the comment says why: "the map is for a single-file transform, so its only source is the module
   itself". A bundle's map has hundreds of `sources`, so the resolver would have to take `position.source`
   (resolved against the map's `sourceRoot`) and the bundle's map would have to be registered under the bundle
   URL, or written next to the bundle on disk so the `source-map-support` fallback finds it. Until then
   `updateSupportCodeLibrary()` in `bindings/binding-registry.ts` writes the bundle's path as every step
   definition's `uri` in every report. `rawPosition` stays unique inside a bundle, so `stepBindingKey()` and the
   duplicate-registration check are safe as they are.
1. **Watch mode and selective loading key on source paths.** `getBindingSourceFiles()` (which watch mode uses
   to find modules that apply decorators without being support files) and `removeBindingsForFile()` compare
   `rawFile` / `filename`; `recordImportEdge()` in `utils/module-graph.ts` records the URLs the resolve hook
   returns; `SupportReloader` evicts and versions by path. All of them would see the bundle, not the sources, and
   need the `build()` `metafile` to map back. Prototype with both features off, as the Phase 10 notes said, and
   count making them compose as part of the item.
1. **Two esbuild configurations would have to become one.** `transpilers/esbuild.ts` (CJS) and
   `transpilers/esm/esbuild.mjs` (ESM) each assemble `tsconfigRaw` from the decorator mode
   (`global.experimentalDecorators` in the CJS build, `CUCUMBER_EXPERIMENTAL_DECORATORS` in the `.mjs`). The ESM
   one additionally rewrites tsconfig `paths` imports to absolute `file:` URLs by regex (`rewritePathMappings()`)
   before `transformSync`, and `loadVue()` in `loader-utils.mjs` rewrites the SFC output's alias imports
   (`transformImports()`). A `build()` with `bundle: true` and the consumer's `tsconfig` resolves aliases natively,
   so both rewriters disappear on that path — which is the one genuine simplification bundling offers. esbuild
   0.25.10 lowers both decorator modes.
1. **Vue needs an `onLoad` plugin, and it is small.** `compileVueSFC(source, filename, { format: 'esm',
   enableStyle })` in `transpilers/vue-sfc-compiler.ts` already emits an ES module whose imports (`vue`, aliases,
   relative paths) the bundler would resolve; the `withTranspileCache()` wrapper around it stays valid per file,
   so a `.vue` file's compile is cached even when the bundle is not.
1. **One bundle, not one per support file.** `getSupportCodeLibrary()` in `api/support.ts` imports the
   `importPaths` sequentially, `test-setup.mjs` first (it installs jsdom mocks on `globalThis`, `document`,
   `window.URL` and `console`), after `vue-jsdom-setup.mjs` has been `require`d. A synthetic entry that imports
   the support files in that order preserves evaluation order and, because esbuild deduplicates within a bundle,
   module identity for shared helpers. One bundle per support file would give every bundle its own copy of each
   shared helper's module-level state (a store, a context holder), which is the identity failure item 25's rating
   warns about. For `format: 'cjs'` esbuild has no code splitting, so a single bundle is the only shape there in
   any case.
1. **Path-relative code moves.** A bundle relocates `__dirname`, `__filename` and `import.meta.url` to the
   bundle's location. The UIS suite uses none of them in its tests or application source (the one
   `import.meta.env.BASE_URL`, in the app router, would need a `define`), but a consumer that locates fixtures
   relative to its step file would break, and that is a documented-limitation kind of change, not a bug to fix.
1. **Where the hook time is, if anyone wants it without bundling.** `esm:resolve` — 9407 calls, 2.31 s clean,
   about 0.25 ms each — is the largest hook figure, and most of those calls are for dependency modules a bundle
   would not remove. Phase 7 attributed the bulk of it to Node's own resolver under `nextResolve`, not to the
   hook body (`resolveTsconfigPaths()` fast path, `recordImportEdge()`, `versionedUrl()`), so a hook-side change
   has little to gain either.

## Re-rating after Phase 11

| #   | Change | I/C after Phase 10 | I/C now | Why |
| --- | --- | --- | --- | --- |
| 25  | esbuild `build()` bundling | 4 / 10 | closed | Ceiling 1–3 s of a 241 s CI run (about 1%): 1596 of the 2564 ES modules are external dependencies a bundle leaves alone, jsdom loads by `require()` outside the hooks, and the inner loop is already served by `--watch` and `selectiveLoad`. The worklist is complete: every item has landed, been dropped by measurement, or been closed. |

## Notes specific to Phase 12

- Phase 12 is the release gate described under [Phase 12 scope](../plan/phase-12-plan.md#phase-12-scope); this phase changed nothing it
  depends on.
- Before measuring anything on this machine, look for stray filesystem scanners first
  (`Get-Process | Sort-Object CPU -Descending | Select-Object -First 8`); this session's `find` had been running
  for a day. A `gherkin` row at three times its usual 170 ms with transpile-cache hits at 1 ms per file is the
  signature of disk contention, distinct from the `bootstrap` 10–30 s pattern of earlier notes, and it does not
  settle with repeated runs.
- Build with `yarn build`, never bare `tsc`; run `yarn test:all` before calling the phase done.
