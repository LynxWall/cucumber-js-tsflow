/* eslint-disable no-console */
/* This is one rare place where we're fine to use process/console directly,
 * but other code abstracts those to remain composable and testable. */
import Cli, { ICliRunResult } from './';
import VError from 'verror';
import { validateNodeEngineVersion } from '@cucumber/cucumber/lib/cli/validate_node_engine_version';
import { BindingRegistry } from '../cucumber/binding-registry';
function logErrorMessageAndExit(message: string): void {
	console.error(message);
	process.exit(1);
}

export default async function run(): Promise<void> {
	validateNodeEngineVersion(
		process.version,
		(error: any) => {
			console.error(error);
			process.exit(1);
		},
		console.warn
	);

	const cli = new Cli({
		argv: process.argv,
		cwd: process.cwd(),
		stdout: process.stdout,
		stderr: process.stderr,
		env: process.env
	});

	let result!: ICliRunResult;
	try {
		result = await cli.run();
	} catch (error: any) {
		logErrorMessageAndExit(VError.fullStack(error));
	}

	let exitCode = result.success ? 0 : 1;
	if (!result.success && global.messageCollector.hasFailures()) {
		exitCode = 2;
	}

	const registry = BindingRegistry.instance;

	if (result.shouldExitImmediately) {
		process.exit(exitCode);
	} else {
		process.exitCode = exitCode;
	}
}
