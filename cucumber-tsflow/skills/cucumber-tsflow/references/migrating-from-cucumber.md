# Migrating CucumberJS support code

Detail behind [SKILL.md](../SKILL.md). Use this when converting a plain CucumberJS suite, or a file of
functional steps inside a cucumber-tsflow project, to binding classes.

## Package and runner

1. Remove `@cucumber/cucumber` from the project's dependencies and add `@lynxwall/cucumber-tsflow` as a dev
   dependency. It depends on the CucumberJS version it supports.
1. Replace `cucumber-js` with `cucumber-tsflow` in scripts, CI and launch configurations. Running through
   `cucumber-js` skips the scenario-context handling that binding classes need, so their steps fail.
1. Replace a `requireModule` of `ts-node/register` (or a hand-written loader) with the `transpiler` option.
   See [configuration.md](configuration.md#transpilers).

## Mapping

| CucumberJS | cucumber-tsflow |
| --- | --- |
| `Given(pattern, fn)` / `When` / `Then` | `@given(pattern)` / `@when` / `@then` on a method of a `@binding()` class |
| `Given(pattern, { timeout }, fn)` | `@given(pattern, undefined, timeout)` |
| `Before(fn)`, `Before('@tag', fn)`, `Before({ tags, timeout }, fn)` | `@before()`, `@before('@tag')`, `@before(tags, timeout)` |
| `After`, `BeforeStep`, `AfterStep` | `@after`, `@beforeStep`, `@afterStep`, same arguments as `@before` |
| `BeforeAll(fn)` / `AfterAll(fn)` | `@beforeAll()` / `@afterAll()` on a `static` method |
| State on `this` (the World) | Fields of a context class injected with `@binding([Context])` |
| `setWorldConstructor(CustomWorld)` | Context classes; keep a World constructor only for code that still needs it |
| `this.attach`, `this.log`, `this.parameters` | `this.world.attach`, … on a context class that stored the World from its constructor |
| `import { ... } from '@cucumber/cucumber'` | The same names from `@lynxwall/cucumber-tsflow/bindings` |

## Worked example

Before:

```ts
import { Given, Then, Before } from '@cucumber/cucumber';
import { expect } from 'chai';

Before(function () {
	this.items = [];
});

Given('I add {string}', function (item: string) {
	this.items.push(item);
});

Then('the list has {int} items', function (count: number) {
	expect(this.items).to.have.length(count);
});
```

After:

```ts
// fixtures/list-context.ts
import type { World } from '@lynxwall/cucumber-tsflow/bindings';

export class ListContext {
	public items: string[] = [];

	constructor(public world: World) {}
}
```

```ts
// step_definitions/list-steps.ts
import { binding, given, then } from '@lynxwall/cucumber-tsflow/bindings';
import { expect } from 'chai';
import { ListContext } from '../fixtures/list-context';

@binding([ListContext])
export default class ListSteps {
	constructor(private list: ListContext) {}

	@given('I add {string}')
	add(item: string): void {
		this.list.items.push(item);
	}

	@then('the list has {int} items')
	hasItems(count: number): void {
		expect(this.list.items).to.have.length(count);
	}
}
```

The `Before` hook disappears: a context is created fresh for every scenario, so its field initializers do the
reset. Keep a `@before` only for work that needs the scenario's tags or must run in a set order.

## Order of work

1. Convert every step and hook in the profile's support globs before the first run. The cucumber-tsflow runner
   cannot execute a step or hook registered with CucumberJS's own `Given()`, `Before()`, …: when it reaches one,
   the whole run aborts with `Unable to find StepBinding!` and exit code `1`. On a large suite, convert one area at a time behind a
   profile whose `paths` and support globs cover only the converted area, and grow the globs as you go.
1. Group steps into classes by domain, not by `Given`/`When`/`Then`. Steps of one class share an instance
   within a scenario; steps in different classes share only injected contexts.
1. When the last functional step is gone, remove any World constructor that only held state, and remove
   `@cucumber/cucumber` imports that remain for types.
