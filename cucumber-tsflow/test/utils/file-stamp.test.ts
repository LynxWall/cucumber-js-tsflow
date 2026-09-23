import { describe, it } from 'node:test';
import { expect } from 'chai';
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import fileStamp from '../../lib/utils/file-stamp.js';
import { temporaryDirectory } from '../helpers/temp.ts';

const { stampOf, sameStamp } = fileStamp;

describe('stampOf', () => {
	const directory = temporaryDirectory('file-stamp');

	it('records the size and modification time of a regular file', () => {
		const file = path.join(directory, 'a.ts');
		writeFileSync(file, 'export const a = 1;');
		const stat = statSync(file);
		expect(stampOf(file)).to.deep.equal({ mtimeMs: stat.mtimeMs, size: stat.size });
	});

	it('is undefined for a missing file and for a directory', () => {
		expect(stampOf(path.join(directory, 'missing.ts'))).to.equal(undefined);
		const nested = path.join(directory, 'nested');
		mkdirSync(nested);
		expect(stampOf(nested)).to.equal(undefined);
	});
});

describe('sameStamp', () => {
	it('is true only when both the size and the modification time agree', () => {
		const stamp = { mtimeMs: 1000, size: 20 };
		expect(sameStamp(stamp, { mtimeMs: 1000, size: 20 })).to.equal(true);
		expect(sameStamp(stamp, { mtimeMs: 1001, size: 20 })).to.equal(false);
		expect(sameStamp(stamp, { mtimeMs: 1000, size: 21 })).to.equal(false);
	});
});
