#!/usr/bin/env node

// Persist V8 bytecode across runs (Node >= 22.8). Set before anything else loads so the library, its
// dependencies and the transpiled support code are all served from the cache; exported to the environment
// so that parallel child processes and worker threads use the same directory from their first module.
// NODE_DISABLE_COMPILE_CACHE=1 turns it off and NODE_COMPILE_CACHE=<dir> chooses the directory, both
// honoured by Node itself.
const nodeModule = require('node:module');
if (typeof nodeModule.enableCompileCache === 'function') {
	const { directory } = nodeModule.enableCompileCache();
	if (directory && !process.env.NODE_COMPILE_CACHE) {
		process.env.NODE_COMPILE_CACHE = directory;
	}
}

require('../lib/cli/run.js').default();
