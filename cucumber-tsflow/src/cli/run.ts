/* This is one rare place where we're fine to use process/console directly,
 * but other code abstracts those to remain composable and testable. */
import Cli, { ICliRunResult } from './index';
import { validateNodeEngineVersion } from '@cucumber/cucumber/lib/cli/validate_node_engine_version';
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
		logErrorMessageAndExit(error);
	}

	// 0 = success, 2 = failed or has pending, undefined or unknown steps
	let exitCode = result.success ? 0 : 2;
	if (!result.success && global.messageCollector.hasFailures()) {
		// 3 = implemented tests have failed
		exitCode = 3;
	}

	if (result.shouldExitImmediately) {
		process.exit(exitCode);
	} else {
		process.exitCode = exitCode;
	}
}
