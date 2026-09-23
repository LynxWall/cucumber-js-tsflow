import { describe, it } from 'node:test';
import { expect } from 'chai';
import loggerCjs from '../../lib/utils/tsflow-logger.js';
import * as loggerEsm from '../../lib/utils/tsflow-logger.mjs';

// The CommonJS module and its hand-written ESM twin (used by the loaders) must format a throwable the same way
const twins: Array<[string, typeof loggerCjs]> = [
	['CommonJS', loggerCjs],
	['ESM', loggerEsm as unknown as typeof loggerCjs]
];

for (const [name, { describeThrowable, formatThrowable, messageOf }] of twins) {
	describe(`tsflow-logger (${name}): describing a throwable`, () => {
		it('names an Error by its class and message', () => {
			expect(describeThrowable(new TypeError('bad type'))).to.equal('TypeError: bad type');
			expect(messageOf(new TypeError('bad type'))).to.equal('bad type');
		});

		it('prints a thrown primitive as text', () => {
			expect(describeThrowable('boom')).to.equal('boom');
			expect(describeThrowable(42)).to.equal('42');
			expect(describeThrowable(undefined)).to.equal('undefined');
		});

		it('describes an object with no prototype and no message without throwing', () => {
			// What a ts-node TSError thrown on Node's loader hooks thread arrived as before the loader rebuilt it as an Error
			const bare = Object.create(null) as object;
			expect(() => String(bare)).to.throw(TypeError);
			expect(messageOf(bare)).to.equal('[object Object] (the thrown value is not an Error)');
			expect(describeThrowable(bare)).to.equal('[object Object] (the thrown value is not an Error)');
			expect(formatThrowable(bare)).to.equal('[object Object] (the thrown value is not an Error)');
		});

		it('falls back to Error for an object with a message but no name', () => {
			expect(describeThrowable({ message: 'plain' })).to.equal('Error: plain');
		});
	});

	describe(`tsflow-logger (${name}): formatting a cause chain`, () => {
		it('lists each cause on its own line', () => {
			const error = new Error('outer', { cause: new RangeError('inner') });
			expect(formatThrowable(error)).to.equal('Error: outer\ncaused by RangeError: inner');
		});

		it('skips a cause whose message the level above already embeds', () => {
			const inner = new Error('Cannot find module ./nothing');
			const wrapped = new Error(`Failed to resolve ./nothing: ${inner.message}`, { cause: inner });
			const outer = new Error(`Failed during cucumber execution: ${wrapped.message}`, { cause: wrapped });
			expect(formatThrowable(outer)).to.equal(
				'Error: Failed during cucumber execution: Failed to resolve ./nothing: Cannot find module ./nothing'
			);
		});

		it('keeps a cause the level above did not embed, below one it did', () => {
			const root = new Error('the hook failed on purpose');
			const hook = new Error('a BeforeAll hook errored, process exiting: steps.ts:9', { cause: root });
			const outer = new Error(`Failed during cucumber execution: ${hook.message}`, { cause: hook });
			expect(formatThrowable(outer)).to.equal(
				'Error: Failed during cucumber execution: a BeforeAll hook errored, process exiting: steps.ts:9\n' +
					'caused by Error: the hook failed on purpose'
			);
		});

		it('stops on a cause cycle', () => {
			const error = new Error('loops');
			error.cause = error;
			expect(formatThrowable(error)).to.equal('Error: loops');
		});

		it('formats a thrown primitive and an Error-shaped object', () => {
			expect(formatThrowable('boom')).to.equal('boom');
			expect(formatThrowable({ name: 'Custom', message: 'shaped', cause: 'text' })).to.equal(
				'Custom: shaped\ncaused by text'
			);
		});
	});
}
