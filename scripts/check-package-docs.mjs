#!/usr/bin/env node
/**
 * Checks that the committed copies of README.md, CHANGELOG.md and LICENSE in cucumber-tsflow/ are byte-identical
 * to the root files. The root files are the source of truth; `yarn build` copies them into the package, and the
 * copies are committed build output that goes stale when a root file is edited without rebuilding (which has
 * shipped a one-entry-behind CHANGELOG before). CI runs this before `yarn build`, on the files as checked out,
 * because running it after a build would compare freshly regenerated copies and hide the staleness.
 *
 *   node scripts/check-package-docs.mjs
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = ['README.md', 'CHANGELOG.md', 'LICENSE'];
const stale = [];

for (const file of files) {
	const rootCopy = readFileSync(path.join(repoRoot, file));
	const packageCopy = readFileSync(path.join(repoRoot, 'cucumber-tsflow', file));
	if (!rootCopy.equals(packageCopy)) {
		stale.push(file);
	}
}

if (stale.length > 0) {
	console.error(`Stale package cop${stale.length === 1 ? 'y' : 'ies'}: ${stale.join(', ')}.`);
	console.error('The root file is the source of truth. Run `yarn build` and commit the refreshed copies.');
	process.exit(1);
}

console.log('Package copies of README.md, CHANGELOG.md and LICENSE match the root files.');
