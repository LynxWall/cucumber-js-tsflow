# Bindings, hooks and context injection

Detail behind the rules in [SKILL.md](../SKILL.md). Everything here is imported from
`@lynxwall/cucumber-tsflow/bindings` (or the package root, which re-exports it).

## Binding classes

- `@binding()` marks a class whose decorated methods are registered with CucumberJS when the file is loaded.
  `@binding([TypeA, TypeB])` also declares the context types its constructor receives, in that order.
- The class is instantiated lazily, the first time one of its steps or hooks runs in a scenario, and that
  instance serves every step and hook of the class for the rest of the scenario. The next scenario gets a new
  instance.
- The decorators run while the file is being evaluated. Nothing registers until the file is imported, which is
  what the profile's `require` or `import` globs do. A step file outside those globs is silently not loaded.
- Default export, named export and `export =` all work. Follow the project's convention.

## Step definitions

```ts
@given('a user named {string} aged {int}')
createUser(name: string, age: number): void {}

@when(/^the user (logs in|logs out)$/)
toggleSession(action: string): void {}

@then('the table shows:')
tableShows(table: DataTable): void {
	const rows = table.hashes();
}

@given('the request body is:')
requestBody(docString: string): void {}
```

- Arguments: one per parameter in the pattern, then a `DataTable` or the doc string when the step has one.
- Parameter types: the CucumberJS built-ins (`{int}`, `{float}`, `{string}`, `{word}`, `{}`, …) plus `{boolean}`,
  which matches `true` or `false`. Custom types come from `defineParameterType`; call it in a support file of its
  own (no step definitions in it), so that selective loading always loads it.
- Async: return a `Promise` or declare the method `async`. The declared parameter count is how CucumberJS tells
  a callback-style step from a promise-style one, so never add a parameter the pattern does not supply.
- Timeout: the third argument, in milliseconds. `@given('a slow thing', undefined, 30000)`. The default is
  CucumberJS's 5000 ms; change it for the run with `setDefaultTimeout(ms)` in a support file.
- Wrapper options: the fourth argument, passed to CucumberJS's definition function wrapper.
  `@then('it eventually settles', undefined, undefined, { retry: 2 })` only does something if the project calls
  `setDefinitionFunctionWrapper`.

## Tag-scoped step definitions

The second argument of a step decorator is **one tag name**, not a tag expression:

```ts
@given('the user is signed in')
signIn(): void {}

@given('the user is signed in', '@sso')
signInWithSso(): void {}
```

- For a scenario that carries `@sso` (on the scenario or inherited from the feature), the tagged alternative runs.
  Otherwise the untagged one does.
- Two untagged definitions of the same pattern, in any classes, are ambiguous. So are two tagged alternatives
  whose tags a scenario both carries. The error lists each candidate with its file and line.
- The alternatives may live in different binding classes. Each runs on an instance of its own class.

## Hooks

```ts
@binding([BrowserContext])
export default class Lifecycle {
	private static server: TestServer;

	constructor(private browser: BrowserContext) {}

	@beforeAll()
	static async startServer(): Promise<void> {
		Lifecycle.server = await TestServer.start();
	}

	@before('@ui')
	async openPage(): Promise<void> {
		await this.browser.open(Lifecycle.server.url);
	}

	@afterStep()
	captureOnFailure(): void {}

	@after()
	cleanup(): void {
		this.browser.reset();
	}

	@afterAll()
	static async stopServer(): Promise<void> {
		await Lifecycle.server.stop();
	}
}
```

- `@before`, `@after`, `@beforeStep` and `@afterStep` take `(tags?, timeout?)`, where `tags` is a CucumberJS tag
  expression such as `'@ui and not @mobile'`. They run on the scenario's binding instance, so injected contexts
  are available.
- `@beforeAll` and `@afterAll` take `(timeout?)` and run once per process (once per worker in a parallel run),
  outside any scenario: no instance, no injected contexts, no World. A non-static method is called with the
  class prototype as `this`, which has none of the instance's fields; make these methods `static` so that is
  obvious.
- Order within a scenario: `@before` hooks; for each step `@beforeStep`, the step, `@afterStep`; `@after` hooks;
  then every context's `dispose()`. A context's `initialize()` runs immediately before the first of those that
  belongs to a class using the context.

## Context classes

- A context class is a plain class listed in some `@binding([...])`. It is created once per scenario, the first
  time any class that lists it is activated, and every binding class that lists it gets that same instance.
- The constructor receives the CucumberJS World and nothing else. Store it if you need `attach`, `log` or
  `parameters`. A context cannot receive another context; compose by passing one to the other from a step, or
  merge them.
- `initialize(info: StartTestCaseInfo)`, optional and sync or async, runs once per scenario before the first hook
  or step of a class that uses the context. `info` has `pickle`, `gherkinDocument` and `testCaseStartedId`.
- `dispose(info: EndTestCaseInfo)`, optional and sync or async, runs when the scenario ends, whatever its result.
  `info` adds `result` and `willBeRetried`. Release resources and unmount components here or in an `@after` hook.
- Injection is positional and unchecked at runtime: the constructor's parameters must be in the order of the
  `@binding` array. A missing entry arrives as `undefined`.

```ts
import { Status } from '@lynxwall/cucumber-tsflow/bindings';
import type { EndTestCaseInfo, StartTestCaseInfo, World } from '@lynxwall/cucumber-tsflow/bindings';

export class ApiContext {
	public lastResponse?: Response;

	constructor(public world: World) {}

	public get baseUrl(): string {
		return this.world.parameters.baseUrl;
	}

	public async initialize(_info: StartTestCaseInfo): Promise<void> {}

	public async dispose({ result }: EndTestCaseInfo): Promise<void> {
		if (result.status === Status.FAILED && this.lastResponse) {
			this.world.attach(await this.lastResponse.text(), 'text/plain');
		}
	}
}
```

### Older pattern: the World from a hook

Existing suites may give a context a `world!: World` property and fill it in a `@before` hook from the binding
instance's `_worldObj`. It still works, but the constructor argument makes the World available earlier (in
`initialize()`) and is the pattern to use in new code.

## Decorator modes

Every decorator supports both TypeScript decorator implementations, chosen per project by configuration (see
[configuration.md](configuration.md#decorator-mode)). The code in a step file is identical in both modes; only
the compiler settings differ. Do not mix modes inside one project.
