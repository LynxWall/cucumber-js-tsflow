#!/usr/bin/env node

// Persist V8 bytecode across runs (Node >= 22.8). Set before anything else loads so the library, its
// dependencies and the transpiled support code are all served from the cache; exported to the environment
// so that parallel child processes and worker threads use the same directory from their first module.
// NODE_DISABLE_COMPILE_CACHE=1 turns it off and NODE_COMPILE_CACHE=<dir> chooses the directory, both
// honored by Node itself.
const nodeModule = require('node:module');
if (typeof nodeModule.enableCompileCache === 'function') {
	const { directory } = nodeModule.enableCompileCache();
	if (directory && !process.env.NODE_COMPILE_CACHE) {
		process.env.NODE_COMPILE_CACHE = directory;
	}
}

// Say what is happening before the library loads. Nothing of cucumber-tsflow's runs until the require below
// returns, which is several hundred modules: normally under half a second, but on a loaded machine the longest
// silent stretch of a run. One dimmed line on stdout, the same muted gray as the phase details, no spinner;
// ansis is loaded here on its own (it is a dependency the library loads moments later anyway) and
// lib/cli/run.js closes the line with the elapsed time. Skipped for the informational switches whose output a
// script may parse, and when TSFLOW_THEME=off silences the startup feedback.
const QUIET_SWITCHES = new Set(['-v', '--version', '-h', '--help', '--i18n-languages', '--i18n-keywords']);
if (process.env.TSFLOW_THEME !== 'off' && !process.argv.slice(2).some(arg => QUIET_SWITCHES.has(arg))) {
	const { version } = require('../package.json');
	const ansis = require('ansis');
	process.stdout.write(
		ansis.dim(
			`Bootstrapping cucumber-tsflow ${version} on Node ${process.version}: loading the library and its dependencies...`
		) + '\n'
	);
	globalThis.__CUCUMBER_TSFLOW_BOOTSTRAP_ANNOUNCED = true;
}

require('../lib/cli/run.js').default();
