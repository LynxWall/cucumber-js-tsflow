import Cli, { ICliRunResult } from './index';
import { validateNodeEngineVersion } from '@cucumber/cucumber/lib/cli/validate_node_engine_version';
import { createLogger } from '../utils/tsflow-logger';
import { recordPhase } from '../utils/tsflow-timing';
import { formatDuration } from '../utils/helpers';
import ansis from 'ansis';

const logger = createLogger('run');

export default async function run(): Promise<void> {
	// Time from process start until the CLI begins: module loading of the library and its dependencies
	const bootstrapMs = performance.now();
	recordPhase('bootstrap', 0);

	// Close the notice bin/cucumber-tsflow.js printed before requiring the library, in the same muted gray
	if (global.__CUCUMBER_TSFLOW_BOOTSTRAP_ANNOUNCED) {
		process.stderr.write(ansis.dim(`cucumber-tsflow loaded in ${formatDuration(bootstrapMs)}.`) + '\n');
	}

	logger.checkpoint('Starting cucumber-tsflow', {
		nodeVersion: process.version,
		cwd: process.cwd()
	});

	validateNodeEngineVersion(
		process.version,
		(error: any) => {
			logger.error('Node version validation failed', error);
			process.exit(1);
		},
		console.warn
	);

	logger.checkpoint('Node version validated');

	let cli: Cli;
	try {
		logger.checkpoint('Constructing CLI');
		cli = new Cli({
			argv: process.argv,
			cwd: process.cwd(),
			stdout: process.stdout,
			stderr: process.stderr,
			env: process.env
		});
		logger.checkpoint('CLI constructed');
	} catch (error: any) {
		logger.error('Failed during CLI initialization', error);
		process.exit(1);
	}

	let result!: ICliRunResult;
	try {
		logger.checkpoint('Running CLI');
		result = await cli.run();
		logger.checkpoint('CLI run completed', { success: result.success });
	} catch (error: any) {
		logger.error('Failed during CLI execution', error);
		process.exit(1);
	}

	// 0 = success, 2 = failed or has pending, undefined or unknown steps
	let exitCode = result.success ? 0 : 2;
	// The collector exists only once the support code has loaded; a run that failed before that has no test failures
	if (!result.success && global.messageCollector?.hasFailures()) {
		// 3 = implemented tests have failed
		exitCode = 3;
	}

	logger.checkpoint('Exiting', { exitCode });

	if (result.shouldExitImmediately) {
		process.exit(exitCode);
	} else {
		process.exitCode = exitCode;
	}
}
