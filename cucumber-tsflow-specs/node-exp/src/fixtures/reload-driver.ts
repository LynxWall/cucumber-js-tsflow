/**
 * Drives `loadSupport` and `reloadSupport` for the reload-support spec in a process of its own, the way a
 * persistent worker process (the companion VS Code extension, say) uses them: one command per line on
 * stdin, one JSON reply per line on stdout. The spec cannot call the API in its own process, because a
 * load replaces the process-wide `BindingRegistry` and CucumberJS builder that the running suite depends on.
 *
 * Started as `node -r @lynxwall/cucumber-tsflow/esnode src/fixtures/reload-driver.ts` from the workspace, so
 * that this file and the fixtures are transpiled by the es-node transpiler in the decorator mode the spec
 * run is in, which the transpiler reads from the environment the spec run passes down.
 */
import { createInterface } from 'node:readline';
import path from 'node:path';
import type { ITsFlowLoadSupportOptions } from '@lynxwall/cucumber-tsflow/api';
import { loadSupport, reloadSupport } from '@lynxwall/cucumber-tsflow/api';

/** The parts of the loaded library the spec asserts on; the API's return type is opaque. */
interface LoadedLibrary {
	stepDefinitions: Array<{ pattern: string | RegExp }>;
	beforeTestCaseHookDefinitions: unknown[];
}

/** What every command answers. */
interface Reply {
	/** The step patterns in the library, sorted */
	steps: string[];
	hooks: number;
	/** Whether the first fixture's module was evaluated again since the previous command */
	reevaluated: boolean;
}

const FIRST_FIXTURE = 'reload-fixture.ts';
const options: ITsFlowLoadSupportOptions = {
	sources: { paths: [], defaultDialect: 'en', names: [], tagExpression: '', order: 'defined' },
	support: {
		requireModules: [],
		requirePaths: ['./src/fixtures/reload-fixture.ts', './src/fixtures/reload-fixture-two.ts'],
		importPaths: [],
		loaders: []
	},
	experimentalDecorators: process.env.CUCUMBER_EXPERIMENTAL_DECORATORS === 'true'
};

/** The first fixture's entry in require.cache: its key and the module object. */
function firstFixture(): [string, object] {
	const entry = Object.entries(require.cache).find(([key]) => path.basename(key) === FIRST_FIXTURE);
	if (!entry?.[1]) throw new Error(`${FIRST_FIXTURE} is not in require.cache`);
	return [entry[0], entry[1]];
}

let previousModule: object | undefined;

function describe(loaded: unknown): Reply {
	const library = loaded as LoadedLibrary;
	const [, module] = firstFixture();
	const reevaluated = module !== previousModule;
	previousModule = module;
	return {
		steps: library.stepDefinitions.map(definition => String(definition.pattern)).sort(),
		hooks: library.beforeTestCaseHookDefinitions.length,
		reevaluated
	};
}

const commands: Record<string, () => Promise<Reply>> = {
	load: async () => describe(await loadSupport(options)),
	reload: async () => describe(await reloadSupport(options, [])),
	'reload-changed': async () => describe(await reloadSupport(options, [firstFixture()[0]]))
};

const input = createInterface({ input: process.stdin });
input.on('line', async line => {
	const command = commands[line.trim()];
	try {
		if (!command) throw new Error(`Unknown command "${line}"`);
		process.stdout.write(`${JSON.stringify(await command())}\n`);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		process.stdout.write(`${JSON.stringify({ error: message })}\n`);
	}
});
input.on('close', () => process.exit(0));
