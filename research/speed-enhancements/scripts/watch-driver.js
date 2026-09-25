#!/usr/bin/env node
// Drives `cucumber-tsflow --watch` through a piped stdin for the watch-mode measurements described in
// research/speed-enhancements/testing/local-consumer-testing.md: spawns the CLI with `--watch`, logs stdout and
// stderr to a file, waits for each "Run took" status line, writes "\n" (a rerun) until the requested number of
// runs is reached, then "q".
//
// usage: node research/speed-enhancements/scripts/watch-driver.js <logfile> <runs> [node args...] -- <cli args...>
//   e.g. node research/speed-enhancements/scripts/watch-driver.js research/speed-enhancements/profiles/x/dim-watch.log 2 -- -p dim
//        node research/speed-enhancements/scripts/watch-driver.js research/speed-enhancements/profiles/x/full-watch.log 2 --max-old-space-size=8192 -- -p default
// TSFLOW_WATCH_CWD sets the directory the CLI runs in (default: the current directory); for the measurements it is
// the UIS Tools `test` package, Tools.Web/VueApp/test in the UIS Tools repository.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const [logFile, runsArg, ...rest] = process.argv.slice(2);
const runs = Number(runsArg);
const sep = rest.indexOf('--');
if (!logFile || !Number.isInteger(runs) || runs < 1 || sep < 0) {
	console.error('usage: node watch-driver.js <logfile> <runs> [node args...] -- <cli args...>');
	process.exit(2);
}
const nodeArgs = rest.slice(0, sep);
const cliArgs = rest.slice(sep + 1);
const cwd = process.env.TSFLOW_WATCH_CWD || process.cwd();
const bin = '../node_modules/@lynxwall/cucumber-tsflow/bin/cucumber-tsflow.js';

fs.mkdirSync(path.dirname(path.resolve(logFile)), { recursive: true });
const log = fs.createWriteStream(path.resolve(logFile));
const start = Date.now();
const child = spawn(process.execPath, [...nodeArgs, bin, ...cliArgs, '--watch'], {
	cwd,
	env: { ...process.env, TSFLOW_TIMING: 'true', TSFLOW_THEME: 'off' },
	stdio: ['pipe', 'pipe', 'pipe']
});

let done = 0;
let buffer = '';
function onChunk(chunk) {
	log.write(chunk);
	buffer += chunk.toString();
	let idx;
	while ((idx = buffer.indexOf('\n')) >= 0) {
		const line = buffer.slice(0, idx);
		buffer = buffer.slice(idx + 1);
		if (line.includes('Run took')) {
			done++;
			const note = `### run ${done} done at ${Date.now() - start} ms since spawn: ${line.trim()}\n`;
			log.write(note);
			process.stdout.write(note);
			child.stdin.write(done < runs ? '\n' : 'q');
		}
	}
}
child.stdout.on('data', onChunk);
child.stderr.on('data', onChunk);
child.on('exit', (code, signal) => {
	const note = `### exit code=${code} signal=${signal} at ${Date.now() - start} ms\n`;
	log.write(note);
	process.stdout.write(note);
	log.end();
});
