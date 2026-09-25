// Template for the script the harness runs inside the console window. Copy it next to your test, point it at
// the BUILT library (lib/, never src/), and drive the real component against the real stream: process.stderr,
// where cucumber-tsflow draws its startup progress since 8.0 (launch with -StderrToConsole), with the formatter's
// kind of output on process.stdout after it.
//
// Keep the things that made earlier bugs visible:
//  - a detail long enough to wrap at 80 columns (lines are never fitted to the width), and glyphs outside ASCII (— ✓) in what is drawn
//  - a synchronous block of the main thread, as the transpiler does, while something should keep animating
//  - more than one phase, so the hand-off between one closing line and the next opening line is exercised
//  - the "cursor row / col" line at the end, so misplaced cursors show up even when the text looks right
const { StartupProgress, resolveStartupTheme } = require('C:/Git/GitHub/cucumber-js-tsflow/cucumber-tsflow/lib/utils/startup-progress.js');

const block = ms => {
	const until = Date.now() + ms;
	while (Date.now() < until) {}
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
	process.stdout.write(`columns=${process.stderr.columns} stdoutTTY=${process.stdout.isTTY} stderrTTY=${process.stderr.isTTY}\n`);
	const p = new StartupProgress(process.stderr, resolveStartupTheme(process.env.TSFLOW_THEME));
	p.begin('resolve', 'resolving support-code globs and plugins');
	await sleep(300);
	p.end('216 support files, 212 feature files');
	p.begin('load', 'transpiling and loading 216 support files with es-vue-esm and extra words so the line wraps at 80 columns', 216);
	await sleep(400);
	block(2000); // main thread blocked: the spinner must keep turning
	p.tick();
	await sleep(300);
	p.tick();
	await sleep(300);
	p.end('1620 step definitions, 254 hooks');
	p.begin('parse', 'parsing 212 feature files into scenarios', 212);
	await sleep(400);
	p.finish();
	process.stdout.write('DONE\n');
	await sleep(200);
	process.exit(0);
})();
