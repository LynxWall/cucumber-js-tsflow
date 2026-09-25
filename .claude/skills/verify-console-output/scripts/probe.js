// Preflight for the harness: prints what the console looks like from inside node, from the main thread and from
// a worker thread. Expected in a real console window: isTTY=true, a sensible column count, and a worker that can
// open a tty.WriteStream on fd 1. If isTTY is false the harness is not running in a console and nothing else
// in the skill is meaningful.
const { Worker, isMainThread, parentPort } = require('node:worker_threads');

if (isMainThread) {
	process.stdout.write(`main: isTTY=${process.stdout.isTTY} columns=${process.stdout.columns} rows=${process.stdout.rows} platform=${process.platform} node=${process.version}\n`);
	process.stdout.write('main: glyph check — … ✓ (each must render as ONE cell)\n');
	const w = new Worker(__filename);
	w.on('message', m => process.stdout.write(`main: worker says ${m}\n`));
	w.on('exit', () => process.stdout.write('main: END\n'));
} else {
	let how;
	try {
		const s = new (require('node:tty').WriteStream)(1);
		s.write('worker: wrote this through tty.WriteStream — … ✓\n');
		how = `tty.WriteStream ok isTTY=${s.isTTY} columns=${s.columns}`;
	} catch (e) {
		how = `tty.WriteStream FAILED: ${e.message}`;
	}
	parentPort.postMessage(how);
	process.exit(0);
}
