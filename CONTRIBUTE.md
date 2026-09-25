# Welcome 💖

Before anything else, thank you for taking some of your precious time to help this project move forward. ❤️

If you're new to open source and feeling a bit nervous 😳, we understand! We recommend watching [this excellent guide](https://egghead.io/talks/git-how-to-make-your-first-open-source-contribution)
to give you a grounding in some of the basic concepts. We want you to feel safe to make mistakes, and ask questions.

If anything in this guide or anywhere else in the codebase doesn't make sense to you, please let us know! It's through your feedback that we can make this codebase more welcoming, so we'll be glad to hear thoughts.

## What is where

The repository is a Yarn 3 workspaces monorepo:

- `cucumber-tsflow/` is the published library, `@lynxwall/cucumber-tsflow`. Its source is under `src/` and compiles to `lib/`, which is what the `cucumber-tsflow` command and every test run.
- `cucumber-tsflow-specs/` holds eight private test workspaces covering Node and Vue, CommonJS and ESM, TC39 and experimental decorators. They share the feature files in `cucumber-tsflow-specs/features/`, selected per workspace by tag.
- `docs/performance-and-diagnostics.md` is the user guide to the runner's performance features, caches and diagnostics; the README links to it and keeps one paragraph.
- `Architecture.md` describes how the library is put together. Read it before a change that is more than local.
- `cucumber-tsflow/skills/cucumber-tsflow/` is the agent skill that ships with the package (see below).
- `scripts/` holds the benchmark and the packed-tarball smoke test.
- `research/` holds the research behind the code, one folder per project ([research/README.md](research/README.md) lists them). `research/speed-enhancements/` is the record of the 8.0 performance work: the analyses, the execution strategy, the design decisions and the hand-off of every phase.

## Local setup

- Use [Git] to [fork and clone] the repo.
- If you're running Windows, make sure to enable [Developer Mode].
- Install [Node.js](https://nodejs.org/en/) 22 or later.
- Make sure you have `yarn` available: `npm install -g yarn`, or `corepack enable` so that the version pinned in `package.json` is used.
- `yarn` installs the dependencies.
- `yarn build` compiles the library into `cucumber-tsflow/lib/`. Everything else runs against that build, so run it after every change to `src/`.
- `yarn test:unit` runs the unit tests and `yarn test:all` the whole spec matrix.

If everything passes, you're ready to hack! ⛏

## Everyday commands

All commands run from the repository root.

| Task | Command |
| --- | --- |
| Build the library | `yarn build` |
| Build in watch mode | `yarn build:watch` |
| Type-check the library and the unit-test program without emitting | `yarn typecheck` |
| Lint (reports, does not fix) | `yarn lint` |
| Lint and apply ESLint's fixes | `yarn lint:fix` |
| Format with Prettier | `yarn format` |
| Unit tests (Node's `node:test` runner with chai, under `cucumber-tsflow/test/`) | `yarn test:unit` |
| The full spec matrix, what CI runs | `yarn test:all` |
| One module system | `yarn test:cjs`, `yarn test:esm`, `yarn test:experimental` |
| One variant and transpiler, the fastest inner loop | `yarn test:node:cjs-esbuild`, `yarn test:vue:esm-tsnode`, … (see the `scripts` block in `package.json`) |
| Startup benchmark of a spec workspace | `yarn bench` (see the [guide](docs/performance-and-diagnostics.md#measuring-startup-on-this-repository)) |
| Packed-tarball smoke test | `yarn smoke:tarball` |

There is no root `yarn test` script. To run one feature or scenario, call the CLI inside a spec workspace with the profile of the variant you want and CucumberJS's usual filters:

```sh
yarn workspace cucumber-tsflow-node exec cucumber-tsflow -p esnode ../features/basic-test.feature
yarn workspace cucumber-tsflow-node exec cucumber-tsflow -p esnode --name "some scenario name"
```

Profiles live in each workspace's `cucumber.json`.

## Before you open a pull request

1. `yarn build`, then `yarn typecheck` and `yarn lint`: both must report nothing. CI runs them after the build.
1. `yarn test:unit`, then the spec variants your change can affect. A change to loading, transpilation or decorator registration can pass CommonJS with esbuild and fail ESM with ts-node, so for those run `yarn test:all`.
1. Update the documents that describe what you changed, in the same pull request: the `[Unreleased]` section of `CHANGELOG.md`; the README or the performance guide for anything a user sees; `Architecture.md` for anything structural; and the agent skill (next section) for anything a consumer can see.
1. Follow the code style Prettier and ESLint enforce (tabs, single quotes, no trailing commas, CRLF line endings) and write American English in code, comments and documents.
1. `yarn smoke:tarball` when you touch `package.json`, the `exports` map, the `files` list, the `bin` or the `bindings/` and `api/` stubs. It packs the library and runs a feature from the tarball in a fresh CommonJS project and a fresh ESM project.

## Agent skill

The package ships an agent skill in `cucumber-tsflow/skills/cucumber-tsflow/`, which coding agents in consumer projects read (via [skills-npm](https://github.com/antfu/skills-npm)) to learn how to use cucumber-tsflow. If your change alters anything a consumer can see (decorators, configuration options, CLI flags, transpilers, environment variables, error messages or documented behavior), update the skill in the same pull request. Reviewers check it along with the README and CHANGELOG. Keep it one skill: skills-npm links only the first skill of a package in `--recursive` mode, so detail goes into `references/`, not into a second skill.

## Releasing

The GitHub workflows in `.github/workflows/` publish the package: both `release.yml` and `publish.yml` install, run `yarn build` and `yarn test:all`, then publish `cucumber-tsflow/`. The version lives in `cucumber-tsflow/package.json`, and `yarn build` regenerates `src/version.ts` from it. The build also copies `README.md`, `CHANGELOG.md` and `LICENSE` from the repository root into the package directory, so edit the root copies only.

[Git]: https://git-scm.com/
[fork and clone]: https://help.github.com/articles/fork-a-repo/
[Developer Mode]: https://docs.microsoft.com/en-us/windows/apps/get-started/enable-your-device-for-development
