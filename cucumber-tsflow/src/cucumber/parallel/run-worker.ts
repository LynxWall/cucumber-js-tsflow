import Worker from './worker';
import VError from 'verror';

/**
 * Instantiates an instance of our "overridden" Worker class.
 */
function run(): void {
	const exit = (exitCode: number, error?: Error, message?: string): void => {
		if (error && message) {
			console.error(VError.fullStack(new VError(error, message))); // eslint-disable-line no-console
		}
		process.exit(exitCode);
	};
	const worker = new Worker({
		id: process.env.CUCUMBER_WORKER_ID as string,
		sendMessage: (message: any) => {
			if (process.send) process.send(message);
		},
		cwd: process.cwd(),
		exit
	});
	process.on('message', (m: any): void => {
		worker.receiveMessage(m).catch((error: Error) => exit(1, error, 'Unexpected error on worker.receiveMessage'));
	});
}

run();
