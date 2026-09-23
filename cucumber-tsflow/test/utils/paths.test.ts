import { describe, it } from 'node:test';
import { expect } from 'chai';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import paths from '../../lib/utils/paths.js';

const { canonicalPath, canonicalFromUrl, canonicalFromFrameFile, toPosixPath, relativeToCwd } = paths;

const windows = process.platform === 'win32';
const libraryRoot = path.resolve(import.meta.dirname, '..', '..');

describe('canonicalPath', () => {
	it('resolves a relative path against the working directory', () => {
		expect(canonicalPath('a/b.ts')).to.equal(canonicalPath(path.resolve('a/b.ts')));
		expect(path.isAbsolute(canonicalPath('a/b.ts'))).to.equal(true);
	});

	it('gives the same result for two spellings of one file, and folds case only on Windows', () => {
		const file = path.join(libraryRoot, 'Test', 'X.ts');
		if (windows) {
			expect(canonicalPath(file)).to.equal(canonicalPath(file.toUpperCase()));
			expect(canonicalPath(file)).to.equal(canonicalPath(file.replace(/\\/g, '/')));
			expect(canonicalPath(file)).to.equal(file.toLowerCase());
		} else {
			expect(canonicalPath(file)).to.equal(file);
			expect(canonicalPath(file)).to.not.equal(canonicalPath(file.toLowerCase()));
		}
	});
});

describe('canonicalFromUrl and canonicalFromFrameFile', () => {
	const file = path.join(libraryRoot, 'test', 'fixtures', 'a.ts');
	const url = pathToFileURL(file).href;

	it('turns a file URL into the canonical path, ignoring its query and fragment', () => {
		expect(canonicalFromUrl(url)).to.equal(canonicalPath(file));
		expect(canonicalFromUrl(`${url}?tsflow=3`)).to.equal(canonicalPath(file));
		expect(canonicalFromUrl(`${url}#frag`)).to.equal(canonicalPath(file));
	});

	it('returns undefined for anything that is not a well-formed file URL', () => {
		expect(canonicalFromUrl('node:fs')).to.equal(undefined);
		expect(canonicalFromUrl('https://example.com/a.js')).to.equal(undefined);
		// An encoded slash is rejected on every platform; a bare 'file:' is the root directory on POSIX
		expect(canonicalFromUrl('file:///a%2Fb.js')).to.equal(undefined);
	});

	it('reads a V8 frame file name as a URL or an absolute path, and nothing else', () => {
		expect(canonicalFromFrameFile(url)).to.equal(canonicalPath(file));
		expect(canonicalFromFrameFile(file)).to.equal(canonicalPath(file));
		expect(canonicalFromFrameFile('node:internal/modules/cjs/loader')).to.equal(undefined);
		expect(canonicalFromFrameFile('relative.js')).to.equal(undefined);
	});
});

describe('toPosixPath', () => {
	it('turns every backslash into a forward slash and leaves everything else alone', () => {
		expect(toPosixPath('C:\\consumer\\lib\\transpilers\\esm\\esbuild.mjs')).to.equal(
			'C:/consumer/lib/transpilers/esm/esbuild.mjs'
		);
		expect(toPosixPath('../src/steps.ts')).to.equal('../src/steps.ts');
		expect(toPosixPath('@lynxwall/cucumber-tsflow/lib/transpilers/esm/esbuild.mjs')).to.equal(
			'@lynxwall/cucumber-tsflow/lib/transpilers/esm/esbuild.mjs'
		);
	});
});

describe('relativeToCwd', () => {
	const cwd = process.cwd();

	it('makes a file beneath the working directory relative to it', () => {
		expect(relativeToCwd(path.join(cwd, 'src', 'steps.ts'))).to.equal(path.join('src', 'steps.ts'));
		expect(relativeToCwd(path.join(cwd, 'a.ts'))).to.equal('a.ts');
	});

	it('returns a relative path as given', () => {
		expect(relativeToCwd('src/steps.ts')).to.equal('src/steps.ts');
		expect(relativeToCwd('../elsewhere/steps.ts')).to.equal('../elsewhere/steps.ts');
	});

	it('returns the working directory itself, and anything outside it, as given', () => {
		expect(relativeToCwd(cwd)).to.equal(cwd);
		const sibling = path.join(path.dirname(cwd), `${path.basename(cwd)}-other`, 'steps.ts');
		expect(relativeToCwd(sibling)).to.equal(sibling);
		const parent = path.join(path.dirname(cwd), 'steps.ts');
		expect(relativeToCwd(parent)).to.equal(parent);
	});

	it(
		'strips the working directory however its drive letter and separators are spelled, on Windows',
		{ skip: !windows },
		() => {
			const file = path.join(cwd, 'src', 'steps.ts');
			const flipped = file[0] === file[0].toUpperCase() ? file[0].toLowerCase() : file[0].toUpperCase();
			expect(relativeToCwd(flipped + file.slice(1))).to.equal(path.join('src', 'steps.ts'));
			expect(relativeToCwd(file.replace(/\\/g, '/'))).to.equal(path.join('src', 'steps.ts'));
		}
	);
});
