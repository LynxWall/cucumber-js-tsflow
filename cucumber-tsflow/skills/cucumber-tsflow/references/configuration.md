# Configuration

Detail behind [SKILL.md](../SKILL.md). cucumber-tsflow accepts every
[CucumberJS 12 configuration option](https://github.com/cucumber/cucumber-js/blob/v12.7.0/docs/configuration.md)
plus the ones below, in the same files (`cucumber.json`, `cucumber.js`, `cucumber.cjs`, `cucumber.mjs`) and
profiles. `cucumber-tsflow -p <name>` selects a profile; without `-p` the `default` profile is used.

## Options cucumber-tsflow adds

| Option | CLI | Default | Purpose |
| --- | --- | --- | --- |
| `transpiler` | `--transpiler` | none | Which built-in transpiler loads the TypeScript support code (table below) |
| `experimentalDecorators` | `--experimental-decorators` | `false` | Use legacy TypeScript decorators instead of TC39 decorators |
| `enableVueStyle` | `--enable-vue-style` | `false` | Compile `<style>` blocks of `.vue` files (normally skipped) |
| `debugFile` | `--debug-file` | none | Run only the features that use the steps in this step file |
| `transpileCache` | `--no-transpile-cache` | `true` | Cache esbuild and Vue SFC output on disk between runs |
| `selectiveLoad` | `--selective-load` | `false` | On a filtered run, load only the step files the selected scenarios use |
| `watch` | `-w, --watch` | `false` | Stay running and rerun on file changes or Enter |
| `parallelLoad` | `--parallel-load` | none | Deprecated and ignored; prints a notice. Remove it from configurations |

The usual CucumberJS options still do the rest: `paths` (feature globs), `require` or `import` (support globs),
`tags`, `name`, `format`, `formatOptions`, `parallel`, `retry`, `worldParameters`, `strict`.

## Transpilers

| Name | Module system | TypeScript compiled by | `.vue` files |
| --- | --- | --- | --- |
| `es-node` | CommonJS | esbuild | no |
| `es-vue` | CommonJS | esbuild | yes |
| `ts-node` | CommonJS | ts-node | no |
| `ts-vue` | CommonJS | ts-node | yes |
| `es-node-esm` | ESM | esbuild | no |
| `es-vue-esm` | ESM | esbuild | yes |
| `ts-node-esm` | ESM | ts-node | no |
| `ts-vue-esm` | ESM | ts-node | yes |

Choosing:

1. ESM or CommonJS follows the project: a `package.json` with `"type": "module"` needs an `*-esm` transpiler.
1. Vue single-file components need a `*-vue*` transpiler. Those also install a global jsdom (`window`,
   `document`) before support code loads, so component tests need no DOM set-up of their own.
1. Prefer `es-*`. esbuild is much faster and its output is cached on disk. Use `ts-*` only when the project
   depends on ts-node behavior. `ts-node-esm` and `ts-vue-esm` also run on Node's loader hooks thread, where
   selective loading is disabled and each `--watch` rerun is a fresh process; so do `es-node-esm` and
   `es-vue-esm` on Node older than 22.15 or with `TSFLOW_ESM_HOOKS=async`. The CommonJS transpilers and the
   in-thread `es-*-esm` loaders support both.

esbuild strips types without type-checking, and `ts-node`, `ts-vue` and `ts-node-esm` run ts-node
transpile-only; `ts-vue-esm` follows the project's own `ts-node` settings in `tsconfig.json`. Do not rely on a
test run to catch type errors in step files; check them with `tsc --noEmit`.

Neither mode needs `emitDecoratorMetadata`: injection uses the `@binding([...])` array, not reflected types.

## CommonJS and ESM profiles

```json
{
	"default": {
		"transpiler": "es-vue",
		"paths": ["features/**/*.feature"],
		"require": ["features/step_definitions/**/*.ts"]
	}
}
```

```json
{
	"default": {
		"transpiler": "es-vue-esm",
		"paths": ["features/**/*.feature"],
		"import": ["features/step_definitions/**/*.ts"]
	}
}
```

- Files listed under `require` are loaded with `require()` and files under `import` with `import()`. CommonJS
  transpilers hook `require()`, so list support files under `require`; ESM transpilers hook `import()`, so list
  them under `import`.
- The ESM loaders resolve extensionless relative imports (`./helper` to `./helper.ts`, `./Comp` to
  `./Comp.vue`, `./dir` to `./dir/index.ts`) and tsconfig `paths` aliases. The CommonJS transpilers resolve
  `paths` aliases too.
- `requireModule: ["@lynxwall/cucumber-tsflow/esvue"]` is an older way to pick a CommonJS transpiler. Keep it if
  a project uses it; use `transpiler` in new configurations.

## Decorator mode

The decorator mode must be the same in the profile and in `tsconfig.json`.

**TC39 decorators (the default, preferred for new projects):**

```json
{
	"compilerOptions": {
		"target": "es2022",
		"experimentalDecorators": false,
		"lib": ["es2022", "esnext.decorators"]
	}
}
```

The profile leaves `experimentalDecorators` unset or `false`.

**Legacy decorators:**

```json
{
	"compilerOptions": {
		"target": "es2022",
		"experimentalDecorators": true,
		"lib": ["es2022"]
	}
}
```

The profile sets `"experimentalDecorators": true`. Every transpiler except `ts-vue-esm` compiles the step files
with the profile's value (the ts-node ones pass it as a compiler option; the esbuild ones and the Vue SFC compiler
read it from the profile alone); `ts-vue-esm` hands `.ts` files to ts-node's own ESM loader, which reads
`tsconfig.json`. The editor and `tsc --noEmit` read only `tsconfig.json`. Keep the two equal so what the editor
accepts is what the run compiles; under `ts-vue-esm` a mismatch compiles decorators one way and invokes them the
other, which fails while the step files load.

## Vue

- `<style>` blocks are skipped unless `enableVueStyle` is `true`. Enable it only when a test depends on styles,
  for example components from a compiled library. Preprocessors (`sass`, `less`) must then be installed.
- Under the ESM loaders, imported assets (`.png`, `.svg`, …) resolve to their file path string. The CommonJS
  Vue transpilers have no asset loader; keep binary imports out of components under test or stub them.
- TypeScript needs a shim so `.vue` imports type-check:

```ts
declare module '*.vue' {
	import type { DefineComponent } from 'vue';
	const component: DefineComponent<object, object, unknown>;
	export default component;
}
```

## Formatters

On top of the CucumberJS formatters (`progress`, `summary`, `html:<file>`, `json:<file>`, `junit:<file>`,
`message:<file>`, `usage`, …), cucumber-tsflow adds `behave:<file>` (JSON for Behave Pro) and
`junitbamboo:<file>` (JUnit XML where pending and undefined steps are skipped rather than failed). Undefined step
snippets use tsflow's decorator syntax by default.

## Parallel runs

`"parallel": N` starts N worker processes. Each worker loads the support code itself and runs `@beforeAll` and
`@afterAll` itself, so module-level state is per worker and never shared. Use it for large suites; for one
scenario it only adds start-up time.
