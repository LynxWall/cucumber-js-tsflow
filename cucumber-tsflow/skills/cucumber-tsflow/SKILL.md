---
name: cucumber-tsflow
description: Write, run and debug Cucumber BDD tests with @lynxwall/cucumber-tsflow - TypeScript step-definition classes with @binding, @given/@when/@then and hook decorators, constructor-injected context objects shared per scenario, cucumber.json profiles and transpilers (es-node, es-vue, ESM, Vue SFC), and the cucumber-tsflow CLI including --watch and selective loading. Use when adding or reviewing .feature files or step definitions in a project that depends on @lynxwall/cucumber-tsflow, converting CucumberJS Given()/World code to classes, choosing a transpiler, running one scenario, or when a step is undefined or ambiguous, a context is missing, decorators do not register, or startup is slow.
---

# cucumber-tsflow

`@lynxwall/cucumber-tsflow` runs Gherkin features with CucumberJS 12, but step definitions are TypeScript
classes bound with decorators instead of `Given()`/`When()` callbacks, and shared state is injected into their
constructors instead of living on `this` (the World). It ships its own CLI, `cucumber-tsflow`, and its own
transpilers, and it replaces `@cucumber/cucumber` as a direct dependency.

Read the reference files only when the task needs them:

| File | Read it when |
| --- | --- |
| [references/bindings-and-context.md](references/bindings-and-context.md) | Writing step classes, hooks, tag-scoped steps, timeouts, or context classes |
| [references/configuration.md](references/configuration.md) | Setting up `cucumber.json`, picking a transpiler, CJS vs ESM, Vue, decorator mode |
| [references/running-and-debugging.md](references/running-and-debugging.md) | Running a subset, `--watch`, selective loading, caches, timing, reading errors |
| [references/migrating-from-cucumber.md](references/migrating-from-cucumber.md) | Converting plain CucumberJS support code |

## Before you write anything

1. Find the `cucumber.json` (or `cucumber.js`/`.cjs`/`.mjs`) the project runs with and read the profile the
   scripts use (`cucumber-tsflow -p <profile>`). It tells you the transpiler, whether support files are loaded
   with `require` (CommonJS) or `import` (ESM), the decorator mode, and the feature and step globs.
1. Read one existing step file and one context class in the project and copy their conventions: import path,
   default export or named export, context names, folder layout.
1. Search the existing step files for the step text before adding a step. A second definition with the same
   pattern is an ambiguity error, not an override.

## Rules for step files

- **One `@binding()` class per file**, exported. Every step and hook is a decorated **method** of that class.
  Arrow-function properties and free functions are never registered.
- **Import from `@lynxwall/cucumber-tsflow/bindings`** (lighter) or the package root. Never import from
  `@cucumber/cucumber`: it is a transitive dependency, not resolvable under pnpm's strict layout, and a copy
  installed separately is not the one cucumber-tsflow registers with. `World`, `DataTable`, `setDefaultTimeout`,
  `defineParameterType` and `Status` are all re-exported.
- **Step decorators:** `@given(pattern, tag?, timeout?, wrapperOptions?)`, same for `@when` and `@then`. The
  pattern is a Cucumber expression string or a `RegExp`. `{boolean}` is available in addition to the standard
  parameter types.
- **Hook decorators:** `@before(tags?, timeout?)`, `@after(tags?, timeout?)`, `@beforeStep(tags?, timeout?)`,
  `@afterStep(tags?, timeout?)`, `@beforeAll(timeout?)`, `@afterAll(timeout?)`. Tags are a tag expression string
  such as `'@ui and not @slow'`.
- **A binding class is instantiated once per scenario**, on first use, and reused by every step and hook of that
  class in that scenario. Instance fields therefore reset between scenarios and are shared between the steps of
  one class within a scenario.
- **Share state between classes through context classes**, not module-level variables: list them in
  `@binding([ContextA, ContextB])` and accept them in the constructor **in the same order**. Every class that
  asks for `ContextA` in the same scenario gets the same instance.
- **Make `@beforeAll`/`@afterAll` methods `static`.** They run once per process with no scenario, so there is no
  instance, no injected context and no World. Keep what they set up in module scope or a global.
- Step methods take the pattern's parameters, then a `DataTable` or doc string if the step has one, and nothing
  else. Return a `Promise` or make the method `async`; never declare an extra `callback` parameter, because the
  parameter count decides whether CucumberJS waits for a callback.

```ts
import { binding, given, when, then } from '@lynxwall/cucumber-tsflow/bindings';
import { expect } from 'chai';
import { CartContext } from '../fixtures/cart-context';

@binding([CartContext])
export default class CartSteps {
	constructor(private cart: CartContext) {}

	@given('the cart contains {int} {string}')
	addItems(quantity: number, sku: string): void {
		this.cart.add(sku, quantity);
	}

	@when('the customer checks out')
	async checkOut(): Promise<void> {
		await this.cart.checkOut();
	}

	@then('the order total is {float}')
	orderTotal(expected: number): void {
		expect(this.cart.total).to.equal(expected);
	}
}
```

## Context classes

A context class is a plain class. cucumber-tsflow constructs it once per scenario with the CucumberJS `World`
as the only constructor argument, calls `initialize()` before the first hook or step that uses it runs, and
calls `dispose()` when the scenario ends. Both may be `async`. A context cannot inject another context.

```ts
import type { EndTestCaseInfo, StartTestCaseInfo, World } from '@lynxwall/cucumber-tsflow/bindings';

export class CartContext {
	private items = new Map<string, number>();
	public total = 0;

	constructor(public world: World) {}

	public async initialize({ pickle }: StartTestCaseInfo): Promise<void> {
		this.world.log(`starting ${pickle.name}`);
	}

	public dispose(_info: EndTestCaseInfo): void {
		this.items.clear();
	}

	public add(sku: string, quantity: number): void {
		this.items.set(sku, (this.items.get(sku) ?? 0) + quantity);
	}

	public async checkOut(): Promise<void> {
		this.total = [...this.items.values()].reduce((sum, quantity) => sum + quantity * 9.99, 0);
	}
}
```

Use `this.world.attach()`, `this.world.log()` and `this.world.parameters` through the context. Details and the
tag-scoped step rules are in [references/bindings-and-context.md](references/bindings-and-context.md).

## Configuration essentials

```json
{
	"default": {
		"transpiler": "es-node",
		"paths": ["features/**/*.feature"],
		"require": ["features/step_definitions/**/*.ts"],
		"format": ["progress", "html:reports/cucumber.html"]
	}
}
```

- **Transpiler:** `es-node` / `es-vue` for CommonJS, `es-node-esm` / `es-vue-esm` for a `"type": "module"`
  project. The `ts-*` equivalents use ts-node and are slower; prefer the `es-*` ones unless the project needs
  ts-node behavior. `*-vue*` adds `.vue` single-file components and a global jsdom.
- **CommonJS profiles list support files under `require`; ESM profiles list them under `import`.**
- **Decorator mode must agree in two places.** Official (TC39) decorators are the default: `tsconfig.json` has
  `"experimentalDecorators": false` and `"esnext.decorators"` in `lib`. Legacy decorators need
  `"experimentalDecorators": true` in **both** the profile and `tsconfig.json`; the esbuild transpilers read it
  only from the profile.

Everything else, including the full transpiler matrix, is in
[references/configuration.md](references/configuration.md).

## Running tests

Always run with `cucumber-tsflow`, never `cucumber-js`. Run the narrowest thing that proves the change:

```sh
npx cucumber-tsflow -p default features/cart.feature          # one feature
npx cucumber-tsflow -p default features/cart.feature:12       # the scenario at line 12
npx cucumber-tsflow -p default --name "checks out a full cart" # by scenario name
npx cucumber-tsflow -p default --tags "@cart and not @slow"   # by tag expression
```

- An undefined step prints a ready-to-paste method in tsflow syntax. Run the feature before writing the step and
  paste the snippet into the right class.
- Exit codes: `0` passed, `1` configuration error or crash, `2` pending or undefined steps, `3` a step failed.
  `npm run`/`pnpm` scripts collapse every non-zero code to `1`; call `npx cucumber-tsflow` to see the real one.
- For an edit-and-rerun loop, add `--watch`; for a large suite, `--selective-load` skips the step files the
  selected scenarios do not use. Both have caveats: see
  [references/running-and-debugging.md](references/running-and-debugging.md).

## Common mistakes

- Writing `Given('...', function () { this.x = 1; })` or `Before(...)`. The runner cannot execute steps or hooks
  registered that way: the whole run aborts with `Unable to find StepBinding!` and exit code `1`. Write a `@binding()` class, and keep state
  in a context class rather than a `setWorldConstructor` World.
- Importing anything from `@cucumber/cucumber`, including `World` for a type annotation. Use
  `import type { World } from '@lynxwall/cucumber-tsflow/bindings'`.
- Adding `@cucumber/cucumber` to the project's dependencies. cucumber-tsflow brings its own; remove it.
- Defining the same step pattern in two classes to "override" one. That is an ambiguity error unless the
  alternatives are tag-scoped with the second decorator argument.
- Expecting a field set in one scenario to be there in the next. Binding and context instances are per scenario;
  per-run state belongs in a `static @beforeAll` and module scope.
- Using `this.context`, an injected object or the World inside `@beforeAll`/`@afterAll`. None exist there.
- Declaring constructor parameters in a different order from the `@binding([...])` array. Injection is
  positional; the types are not checked at runtime.
- Setting `experimentalDecorators` in `tsconfig.json` but not in the profile, or the reverse. The symptom is
  decorators that throw at load time or steps that are reported undefined although the file loaded.
- Using `require` for support globs in an ESM project, or `import` with a CommonJS transpiler.
- Running the whole suite to check one step, or running through `cucumber-js`.
- Leaving side effects at the top of a step file (patching a global, registering a Vue plugin). With
  `selectiveLoad` on, a step file whose steps are not selected is not loaded, so its side effects vanish. Put
  set-up in a file with no step definitions, or in a hook.
- Mounting components or creating spies without cleaning them up in an `@after` hook. Scenarios leak into each
  other, and under `--watch` the heap grows run after run.
