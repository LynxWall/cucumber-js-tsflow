#!/usr/bin/env node

// Node keys every loaded module by its path and keeps the drive letter of the script it was started with as typed,
// while process.cwd() always has an uppercase one. Started as `node c:\project\...\bin\cucumber-tsflow.js`, this
// file and everything it requires would be cached under `c:`, and the support files, loaded by paths resolved
// against the working directory under `C:`, would import a second copy of the library and of CucumberJS, whose
// builder is never reset ("You're calling functions (e.g. "Given") on an instance of Cucumber that isn't running").
// So everything is required through this file's path spelled with the working directory's drive letter: the rule
// withDriveLetterOf() in lib/utils/paths.ts states, repeated here because nothing of lib/ may load before it.
const { createRequire } = require('node:module');
const cwdDrive = /^[A-Za-z]:/.exec(process.cwd());
const ownDrive = /^[A-Za-z]:/.exec(__filename);
const ownPath =
	cwdDrive && ownDrive && cwdDrive[0].toLowerCase() === ownDrive[0].toLowerCase()
		? cwdDrive[0] + __filename.slice(2)
		: __filename;
const requireHere = createRequire(ownPath);

// Say what is happening before the library loads. Nothing of cucumber-tsflow's runs until the require below
// returns, which is several hundred modules: normally under half a second, but on a loaded machine the longest
// silent stretch of a run. One dimmed line on stderr, where all of cucumber-tsflow's own output goes (stdout carries
// only formatter output), in the same muted gray as the phase details, no spinner; ansis is loaded here on its
// own (it is a dependency the library loads moments later anyway) and lib/cli/run.js closes the line with the
// elapsed time. Skipped for the informational switches whose output a
// script may parse, and when TSFLOW_THEME=off silences the startup feedback.
const QUIET_SWITCHES = new Set(['-v', '--version', '-h', '--help', '--i18n-languages', '--i18n-keywords']);
if (process.env.TSFLOW_THEME !== 'off' && !process.argv.slice(2).some(arg => QUIET_SWITCHES.has(arg))) {
	const { version } = requireHere('../package.json');
	const ansis = requireHere('ansis');
	process.stderr.write(
		ansis.dim(
			`Bootstrapping cucumber-tsflow ${version} on Node ${process.version}: loading the library and its dependencies...`
		) + '\n'
	);
	globalThis.__CUCUMBER_TSFLOW_BOOTSTRAP_ANNOUNCED = true;
}

requireHere('../lib/cli/run.js').default();
