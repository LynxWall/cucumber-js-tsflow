import { describe, it } from 'node:test';
import { expect } from 'chai';
import decoratorMode from '../../lib/utils/decorator-mode.js';

const { setExperimentalDecorators, experimentalDecorators } = decoratorMode;
const globals = globalThis as { experimentalDecorators?: boolean };

describe('the decorator mode', () => {
	it('is recorded for the decorators and for the transpilers in every thread and child', () => {
		setExperimentalDecorators(true);
		expect(globals.experimentalDecorators).to.equal(true);
		expect(process.env.CUCUMBER_EXPERIMENTAL_DECORATORS).to.equal('true');
		expect(experimentalDecorators()).to.equal(true);

		setExperimentalDecorators(false);
		expect(globals.experimentalDecorators).to.equal(false);
		expect(process.env.CUCUMBER_EXPERIMENTAL_DECORATORS).to.equal('false');
		expect(experimentalDecorators()).to.equal(false);
	});

	it('reads the environment on every call, so a value that arrived with the process is honored', () => {
		process.env.CUCUMBER_EXPERIMENTAL_DECORATORS = 'true';
		expect(experimentalDecorators()).to.equal(true);
		delete process.env.CUCUMBER_EXPERIMENTAL_DECORATORS;
		expect(experimentalDecorators()).to.equal(false);
	});
});
