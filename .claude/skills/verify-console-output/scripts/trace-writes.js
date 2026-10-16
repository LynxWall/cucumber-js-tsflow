// Preload for `NODE_OPTIONS=--require <this file>`: appends every tty.WriteStream write, from every thread, to
// the file named by TSFLOW_TRACE_FILE, with thread id, wall-clock time and an escaped copy of the chunk
// (color codes stripped, ESC / CR / LF made visible). Use it to reconstruct cross-thread write ordering when
// the screen dump shows something the code "cannot" have produced. Set TSFLOW_TRACE_COLORS=1 to keep the
// color (SGR) codes in the copy, shown as ESC[...m, when the question is which color each write used.
//
// Both paths must use forward slashes when set from PowerShell for a child process.
const fs = require('node:fs');
const tty = require('node:tty');
const { isMainThread, threadId } = require('node:worker_threads');
const file = process.env.TSFLOW_TRACE_FILE;
if (file) {
	const keepColors = process.env.TSFLOW_TRACE_COLORS === '1';
	const orig = tty.WriteStream.prototype.write;
	tty.WriteStream.prototype.write = function (chunk, ...rest) {
		const text = typeof chunk === 'string' ? chunk : String(chunk);
		const shown = (keepColors ? text : text.replace(/\x1b\[[0-9;]*m/g, ''))
			.replace(/\x1b/g, 'ESC')
			.replace(/\r/g, '\\r')
			.replace(/\n/g, '\\n');
		const who = isMainThread ? 'main   ' : `worker${threadId}`;
		fs.appendFileSync(file, `${(performance.timeOrigin + performance.now()).toFixed(3)} ${who} len=${text.length} ${shown}\n`);
		return orig.call(this, chunk, ...rest);
	};
}
