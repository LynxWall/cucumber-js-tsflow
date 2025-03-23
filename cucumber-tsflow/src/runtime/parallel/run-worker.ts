import { doesHaveValue } from '@cucumber/cucumber/lib/value_checker';
import { ChildProcessWorker } from './worker';
import 'polyfill-symbol-metadata';

function run(): void {
	const exit = (exitCode: number, error?: Error, message?: string): void => {
		if (doesHaveValue(error)) {
			console.error(new Error(message, { cause: error }));
		}
		process.exit(exitCode);
	};
	const worker = new ChildProcessWorker({
		id: process.env.CUCUMBER_WORKER_ID!,
		sendMessage: (message: any) => process.send!(message),
		cwd: process.cwd(),
		exit
	});
	process.on('message', (m: any): void => {
		worker.receiveMessage(m).catch((error: Error) => exit(1, error, 'Unexpected error on worker.receiveMessage'));
	});
}

run();
