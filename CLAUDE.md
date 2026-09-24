# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

`@lynxwall/cucumber-tsflow` is a detached fork of `cucumber-js-tsflow` that wraps and extends CucumberJS 12.7.x, replacing its functional step API with SpecFlow-like TypeScript decorator bindings (`@binding()`, `@given()`, `@when()`, `@then()`, `@before()`, …) plus scoped, constructor-injected context objects. It ships its own CLI (`cucumber-tsflow`), programmatic API, transpilers (esbuild / ts-node-maintained, CJS and ESM, with Vue SFC support), and formatters — so it fully replaces `@cucumber/cucumber` as a direct dependency rather than sitting beside it.

Read [Architecture.md](Architecture.md) before making non-trivial changes. It documents the layer map, execution flow (`CLI → loadConfiguration → runCucumber → parse features → load support (selectively, when enabled) → makeRuntime → Coordinator + Adapter → Worker → TestCaseRunner`, repeated in one process by `--watch` with a `SupportReloader`), the `BindingRegistry` registration flow, DI/`ManagedScenarioContext`, dual decorator support, and the transpiler matrix. Don't duplicate that content here — update it when the architecture changes.

## Repository layout

Yarn 3.5.0 workspaces monorepo:

- [cucumber-tsflow/](cucumber-tsflow/) — the published library; all source under [cucumber-tsflow/src/](cucumber-tsflow/src/), compiled to `lib/`
- [cucumber-tsflow-specs/](cucumber-tsflow-specs/) — 8 private spec workspaces covering the Node/Vue × CJS/ESM × TC39/experimental-decorator matrix, all sharing the feature files in [cucumber-tsflow-specs/features/](cucumber-tsflow-specs/features/)

## Commands

All commands run from the repo root unless noted.

| Task | Command |
|---|---|
| Install | `yarn` |
| Build the library | `yarn build` |
| Build in watch mode | `yarn build:watch` |
| Lint (auto-fix) | `yarn lint` |
| Format | `yarn format` |
| Unit tests (`node --test` over [cucumber-tsflow/test/](cucumber-tsflow/test/), against the built `lib/`) | `yarn test:unit` |
| Full test matrix (what CI runs) | `yarn test:all` |

There is **no root `yarn test` script** — CONTRIBUTE.md is out of date on this point. The tests are the unit tests under `cucumber-tsflow/test/` (Node's built-in runner with chai, importing the built `lib/`) and the spec workspaces, run through the built CLI, so **`yarn build` must succeed before any test command**.

### Running a subset of tests

Test scripts are layered; pick the narrowest one that covers your change:

- By module system: `yarn test:cjs`, `yarn test:esm`, `yarn test:experimental`
- By platform within a group: `yarn test:cjs:node`, `yarn test:esm:vue`, `yarn test:exp:node`, …
- A single variant + transpiler (fastest inner loop): `yarn test:node:cjs-esbuild`, `yarn test:node:esm-tsnode`, `yarn test:vue:cjs-tsnode`, etc. See the `scripts` block in [package.json](package.json) for the full list.

Each of those delegates to a spec workspace script that invokes the CLI with a profile, e.g. `yarn workspace cucumber-tsflow-node test:esbuild` → `cucumber-tsflow -p esnode`.

### Running one feature or scenario

Invoke the CLI directly inside a spec workspace, with the profile that matches the variant you want, then add standard CucumberJS filters:

```sh
yarn workspace cucumber-tsflow-node exec cucumber-tsflow -p esnode ../features/basic-test.feature
yarn workspace cucumber-tsflow-node exec cucumber-tsflow -p esnode --name "some scenario name"
```

Profiles live in each workspace's `cucumber.json` (e.g. `esnode`/`tsnode` in [cucumber-tsflow-specs/node/cucumber.json](cucumber-tsflow-specs/node/cucumber.json)). Each profile sets `transpiler`, `tags`, `parallel`, and the report formats. Feature files are shared and selected per variant by tag (`@node`, `@node-esm`, `@vue`, `@node-exp`, …), so a change that adds a scenario usually needs the right tags to be picked up by the intended workspaces — and only those.

## Build rules (important)

- Always build with `tsc --build tsconfig.node.json` (i.e. via `yarn build`), never bare `tsc`. The base [cucumber-tsflow/tsconfig.json](cucumber-tsflow/tsconfig.json) has **no `outDir`** — it exists for editor/`--noEmit` type-checking. Bare `tsc` emits `.js`/`.js.map` into `src/`, which is wrong.
- `yarn build` also runs `genversion` (regenerates [cucumber-tsflow/src/version.ts](cucumber-tsflow/src/version.ts)), and copies hand-written `.mjs` files from `src/` into `lib/`. A plain `tsc --build` alone is not a complete build.
- `src/transpilers/esm/*` is excluded from the TypeScript build; those are authored `.mjs` loaders copied verbatim.
- After building, verify no stray `.js`/`.js.map` appeared under `src/` (legitimate exception: `src/wrapper.mjs`).
- New public entry points need a matching key in the `exports` map of [cucumber-tsflow/package.json](cucumber-tsflow/package.json).

## Shipped agent skill (keep it in sync)

[cucumber-tsflow/skills/cucumber-tsflow/](cucumber-tsflow/skills/cucumber-tsflow/) is published with the package (it is in the `files` list) and follows the [skills-npm](https://github.com/antfu/skills-npm) convention: a consumer running `skills-npm` gets it linked into their agents' skill folders, so it is what an agent in a consumer project reads about how to use cucumber-tsflow. It is user documentation, versioned with the code.

- **Any change a consumer can see updates the skill in the same commit:** a decorator or its arguments, a configuration option or its default, a CLI flag, a transpiler, an environment variable, an error message the skill quotes, or a behavior it describes (context lifetime, selective loading, watch mode, caches).
- **Every review checks the skill against the diff,** the same way it checks README, CHANGELOG and Architecture.md: a code review, a pull request review, and each Phase 12 stage gate. A stale skill is a review finding.
- **Keep it one skill.** skills-npm 1.2.0 links only the first skill of a package in `--recursive` mode, which is how uis-building-blocks runs it. Put detail in `references/` and keep `SKILL.md` short: rules, then short examples that compile, then "Common mistakes". Only state what was checked against the source.
- Do not confuse it with [.claude/skills/](.claude/skills/), which holds contributor skills for working on this repository and is not published.

## Code style

Enforced by [.prettierrc](.prettierrc) and [eslint.config.mjs](eslint.config.mjs); the fuller written standards are in [.github/instructions/ts-standards.instructions.md](.github/instructions/ts-standards.instructions.md) and [.github/instructions/md-standards.instructions.md](.github/instructions/md-standards.instructions.md).

- **Tabs** for indentation (width 2), single quotes, semicolons required, **no trailing commas**, 120-char print width, `arrowParens: avoid`, CRLF line endings
- Prefer `interface` for object shapes, `type` for unions; explicit return types on exported functions; avoid `any` (though the ESLint config does not currently enforce it)
- Markdown: ATX headings, blank line around every heading/list/table/code block, fenced blocks always language-tagged, `-` for unordered lists, `1.` for every ordered item

Working preferences from [.github/copilot-instructions.md](.github/copilot-instructions.md) that apply here too: don't refactor code you weren't asked to change; don't add error handling, validation, or logging unless requested; don't add dependencies without asking; don't write tests that merely validate third-party APIs or exception throwing.

## Things that bite

- **Global singletons cross process/thread boundaries.** `BindingRegistry.instance` (`global.__CUCUMBER_TSFLOW_BINDINGREGISTRY`), `global.messageCollector`, and `global.experimentalDecorators` are how the runtime, decorators, and transpilers coordinate. Parallel child processes each re-run support-code loading and rebuild their own registry, so anything registration-related must work when executed more than once in different contexts.
- **Support code loads more than once per process in watch mode.** `--watch` calls `runCucumber` → `getSupportCodeLibrary` repeatedly in one process with a `SupportReloader` deciding what is evicted (`require.cache`) or re-imported under a `?tsflow=<n>` query (ESM). Anything registered or cached on the load path must be idempotent or deduplicated (loader registration, the `BindingRegistry`, resolution caches), and `runCucumber` replaces `options.support` with the loaded library, so callers running twice pass a copy.
- **Both decorator modes must keep working.** Every decorator branches on `global.experimentalDecorators` between the legacy `(target, propertyKey, descriptor)` signature and TC39 Stage 3 `(target, context)` with `context.metadata`. A change to one path needs the other checked, and the `*-exp*` spec workspaces are what catch regressions.
- **The full matrix is the real test suite.** A change to loading, transpilation, or registration can pass CJS+esbuild and fail ESM+ts-node. Run `yarn test:all` before considering such a change done.
- Node **>= 22** is required; CI runs Node 24 on ubuntu-latest ([.github/workflows/ci.yml](.github/workflows/ci.yml): install → `yarn build` → `yarn test:all`).
- Reports written to `cucumber-tsflow-specs/reports/` are gitignored build output.
- **Terminal output is only verified on a real console.** Claude's shells capture stdout (`isTTY` is false), so spinners, in-place redraws, colors and non-ASCII glyphs cannot be checked there or with a simulated screen. Use the `verify-console-output` skill ([.claude/skills/verify-console-output/SKILL.md](.claude/skills/verify-console-output/SKILL.md)), which runs the built code in a fresh console window at several widths and reads the screen buffer back, before saying such output works.
