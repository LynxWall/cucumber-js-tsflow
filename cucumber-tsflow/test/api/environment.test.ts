import { describe, it } from 'node:test';
import { expect } from 'chai';
import path from 'node:path';
import environment from '../../lib/api/environment.js';

const { makeEnvironment } = environment;
const windows = process.platform === 'win32';
// The library this test imported, under the drive letter spelling its module keys carry
const libraryRoot = path.resolve(import.meta.dirname, '..', '..');

/** `file` with its drive letter in the other case. */
function flipDrive(file: string): string {
	const drive = file[0];
	return (drive === drive.toUpperCase() ? drive.toLowerCase() : drive.toUpperCase()) + file.slice(1);
}

describe('makeEnvironment', () => {
	it('fills in the defaults and a logger, as CucumberJS does', () => {
		const made = makeEnvironment({});
		expect(made.cwd).to.equal(process.cwd());
		expect(made.stdout).to.equal(process.stdout);
		expect(made.env).to.equal(process.env);
		expect(made.logger).to.have.property('debug');
	});

	it("spells a working directory on the library's drive with the library's drive letter", { skip: !windows }, () => {
		const project = path.join(libraryRoot, 'project', 'test');
		expect(makeEnvironment({ cwd: flipDrive(project) }).cwd).to.equal(project);
		expect(makeEnvironment({ cwd: project }).cwd).to.equal(project);
	});

	it('leaves a working directory on another drive, or without one, as given', () => {
		const otherDrive = libraryRoot.toUpperCase().startsWith('Q:') ? 'r:\\project' : 'q:\\project';
		const other = windows ? otherDrive : '/project';
		expect(makeEnvironment({ cwd: other }).cwd).to.equal(other);
	});
});
