import { describe, it } from 'node:test';
import { expect } from 'chai';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { temporaryDirectory } from '../helpers/temp.ts';

const windows = process.platform === 'win32';

/** `file` with its drive letter in uppercase, as `process.cwd()` spells every path on Windows. */
const upper = (file: string): string => file[0].toUpperCase() + file.slice(1);
/** `file` with its drive letter in lowercase, as a script path typed that way reaches Node. */
const lower = (file: string): string => file[0].toLowerCase() + file.slice(1);

const bin = path.resolve(import.meta.dirname, '..', '..', 'bin', 'cucumber-tsflow.js');
const fixtures = upper(path.join(import.meta.dirname, '..', 'fixtures', 'support'));
const features = upper(temporaryDirectory('bin'));

describe('bin/cucumber-tsflow.js', () => {
	it(
		'loads one copy of the library when started through a lowercase drive letter',
		{ skip: !windows && 'drive letters exist only on Windows' },
		() => {
			const feature = path.join(features, 'one.feature');
			writeFileSync(
				feature,
				['Feature: Drive letter', '', '  Scenario: One step', '    Given a step from file a', ''].join('\n')
			);
			// The support file is required by a path under the working directory's drive letter, as every support file
			// is; before the bin spelled its own path the same way, the file registered its step with a second library
			const result = spawnSync(
				process.execPath,
				[
					lower(bin),
					'--transpiler',
					'es-node',
					'--require',
					path.join(fixtures, 'steps-a.ts'),
					'--format',
					'progress',
					feature
				],
				{ cwd: fixtures, encoding: 'utf8', env: { ...process.env, TSFLOW_THEME: 'off' } }
			);
			expect(result.stderr).to.not.include("isn't running");
			expect(result.status, result.stderr).to.equal(0);
			expect(result.stdout).to.include('1 scenario (1 passed)');
		}
	);
});
