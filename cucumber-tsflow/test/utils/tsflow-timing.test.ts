// The store reads the flag when it is first touched, which happens after the imports below have loaded.
process.env.TSFLOW_TIMING = 'true';

import { describe, it } from 'node:test';
import { expect } from 'chai';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import timing from '../../lib/utils/tsflow-timing.js';
import type { TimingSnapshot } from '../../lib/utils/tsflow-timing.js';

const {
	startTimer,
	recordPhase,
	recordFile,
	getTimingSnapshot,
	mergeTimingSnapshot,
	resetTimings,
	printTimingReport,
	timingRegisterOptions,
	collectLoaderTimings
} = timing;

function report(): string {
	let text = '';
	printTimingReport({ write: chunk => (text += chunk) });
	return text;
}

function phase(snapshot: TimingSnapshot | undefined, name: string) {
	return snapshot?.phases.find(p => p.name === name);
}

describe('recording', () => {
	it('is enabled by TSFLOW_TIMING=true and hands out real timers', () => {
		expect(getTimingSnapshot(), 'a snapshot exists only while timing is on').to.not.equal(undefined);
		expect(startTimer()).to.be.greaterThan(0);
	});

	it('accumulates a phase across calls', () => {
		resetTimings();
		recordPhase('alpha', startTimer());
		recordPhase('alpha', startTimer());
		recordPhase('beta', startTimer());
		const snapshot = getTimingSnapshot();
		expect(phase(snapshot, 'alpha')?.count).to.equal(2);
		expect(phase(snapshot, 'alpha')?.ms).to.be.at.least(0);
		expect(phase(snapshot, 'beta')?.count).to.equal(1);
	});

	it('records one file entry per call', () => {
		resetTimings();
		recordFile('transpile', 'a.ts', startTimer());
		recordFile('require', 'a.ts', startTimer());
		expect(getTimingSnapshot()?.files.map(f => f.kind)).to.deep.equal(['transpile', 'require']);
	});

	it('hands out copies in snapshots', () => {
		resetTimings();
		recordPhase('alpha', startTimer());
		const snapshot = getTimingSnapshot();
		snapshot?.phases.splice(0);
		snapshot?.files.push({ kind: 'load', file: 'x', ms: 1 });
		expect(getTimingSnapshot()?.phases.length).to.equal(1);
		expect(getTimingSnapshot()?.files.length).to.equal(0);
	});

	it('forgets everything recorded and merged on resetTimings but stays enabled', () => {
		recordPhase('alpha', startTimer());
		mergeTimingSnapshot('worker:1', { phases: [{ name: 'x', ms: 1, count: 1 }], files: [], remote: [] });
		resetTimings();
		const snapshot = getTimingSnapshot();
		expect(snapshot?.phases).to.deep.equal([]);
		expect(snapshot?.files).to.deep.equal([]);
		expect(snapshot?.remote).to.deep.equal([]);
		expect(startTimer(), 'still recording after the reset').to.be.greaterThan(0);
	});
});

describe('mergeTimingSnapshot', () => {
	it('nests a remote section under the scope it arrived through', () => {
		resetTimings();
		mergeTimingSnapshot('worker:1', {
			phases: [{ name: 'support:require', ms: 10, count: 1 }],
			files: [{ kind: 'require', file: 'a.ts', ms: 10 }],
			remote: [{ scope: 'esm-hooks', phases: [{ name: 'esm:load', ms: 4, count: 2 }], files: [] }]
		});
		const scopes = getTimingSnapshot()?.remote.map(s => s.scope);
		expect(scopes).to.deep.equal(['worker:1', 'worker:1/esm-hooks']);
	});

	it('accumulates a second snapshot for the same scope instead of duplicating the section', () => {
		resetTimings();
		const snapshot: TimingSnapshot = {
			phases: [{ name: 'esm:load', ms: 4, count: 2 }],
			files: [{ kind: 'load', file: 'a.ts', ms: 4 }],
			remote: []
		};
		mergeTimingSnapshot('esm-hooks', snapshot);
		mergeTimingSnapshot('esm-hooks', {
			...snapshot,
			phases: [
				{ name: 'esm:load', ms: 6, count: 1 },
				{ name: 'esm:resolve', ms: 1, count: 5 }
			]
		});
		const remote = getTimingSnapshot()?.remote;
		expect(remote?.length).to.equal(1);
		expect(remote?.[0].phases).to.deep.equal([
			{ name: 'esm:load', ms: 10, count: 3 },
			{ name: 'esm:resolve', ms: 1, count: 5 }
		]);
		expect(remote?.[0].files.length).to.equal(2);
	});

	it('ignores an undefined snapshot', () => {
		resetTimings();
		mergeTimingSnapshot('worker:2', undefined);
		expect(getTimingSnapshot()?.remote).to.deep.equal([]);
	});
});

describe('printTimingReport', () => {
	it('lays out the main process, the hooks, the workers and the file tables', () => {
		resetTimings();
		recordPhase('config', startTimer());
		recordFile('require', path.resolve('src/steps/a.ts'), startTimer());
		mergeTimingSnapshot('esm-hooks', { phases: [{ name: 'esm:load', ms: 4, count: 2 }], files: [], remote: [] });
		mergeTimingSnapshot('worker:1', {
			phases: [{ name: 'support:require', ms: 10, count: 1 }],
			files: [],
			remote: []
		});
		mergeTimingSnapshot('worker:2', {
			phases: [{ name: 'support:require', ms: 30, count: 1 }],
			files: [{ kind: 'require', file: 'b.ts', ms: 30 }],
			remote: []
		});
		const text = report();
		expect(text).to.include('Startup timing report');
		expect(text).to.include('Main process\n');
		expect(text).to.match(/config\s+[\d.]+\s+1/);
		expect(text).to.include('Main process ESM loader hooks');
		expect(text).to.include('Parallel worker processes (2)');
		// Two worker sections aggregate into total, max and calls
		expect(text).to.match(/support:require\s+40\s+30\s+2/);
		expect(text).to.include('File totals by context');
		// The main family is the main process plus its hooks thread: two contexts
		expect(text).to.match(/main\s+2\s+0\s+/);
		expect(text).to.match(/workers\s+2\s+0\s+/);
		expect(text).to.include('Slowest 2 files');
		expect(text).to.include(path.join('src', 'steps', 'a.ts'));
		expect(text.split('\n').every(line => line === '' || line.startsWith('[tsflow:timing]'))).to.equal(true);
	});

	it('folds every spelling of one file into a single slowest-files row', () => {
		resetTimings();
		const file = path.resolve('src/steps/Folded.ts');
		recordFile('transpile', pathToFileURL(file).href, startTimer());
		recordFile('require', file.replace(/\\/g, '/'), startTimer());
		if (process.platform === 'win32') recordFile('load', file.toUpperCase(), startTimer());
		const rows = report()
			.split('\n')
			.filter(line => line.toLowerCase().includes('folded.ts'));
		expect(rows.length, rows.join('\n')).to.equal(1);
	});

	it('marks a section without phases', () => {
		resetTimings();
		expect(report()).to.include('(no phases recorded)');
	});
});

describe('loader hook thread timings', () => {
	it('collects and merges a hooks thread snapshot once, then finds the store drained', async () => {
		resetTimings();
		const options = timingRegisterOptions();
		expect(options).to.not.equal(undefined);
		const worker = new Worker(path.join(import.meta.dirname, '..', 'fixtures', 'timing-worker.mjs'), {
			workerData: options!.data,
			transferList: options!.transferList
		});
		try {
			await new Promise<void>((resolve, reject) => {
				worker.once('message', () => resolve());
				worker.once('error', reject);
			});
			await collectLoaderTimings();
			const first = getTimingSnapshot()?.remote.find(s => s.scope === 'esm-hooks');
			expect(first?.phases).to.have.length(1);
			expect(first?.phases[0].name).to.equal('esm:load');
			expect(first?.phases[0].count).to.equal(1);
			expect(first?.files.map(f => f.file)).to.deep.equal(['file:///hooks/a.ts']);

			await collectLoaderTimings();
			const second = getTimingSnapshot()?.remote.find(s => s.scope === 'esm-hooks');
			expect(second?.phases[0].count, 'the worker answered with an empty store the second time').to.equal(1);
			expect(second?.files).to.have.length(1);
		} finally {
			await worker.terminate();
		}
	});

	it('gives up on a port nobody answers after the timeout', async () => {
		resetTimings();
		timingRegisterOptions();
		const started = performance.now();
		await collectLoaderTimings(50);
		expect(performance.now() - started).to.be.lessThan(1000);
		expect(getTimingSnapshot()?.remote).to.deep.equal([]);
	});
});
