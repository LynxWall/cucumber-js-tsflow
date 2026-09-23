import { describe, it } from 'node:test';
import { expect } from 'chai';
import { MessageChannel, receiveMessageOnPort } from 'node:worker_threads';
import * as relay from '../../../lib/transpilers/esm/source-map-relay.mjs';

const { initialize, relaySourceMaps } = relay;

/** A loader whose `load` records a map for `url` the way `loadTypeScript()` does, then returns synchronously. */
function recordingLoader(sourceMap: string | undefined) {
	return {
		resolve: (specifier: string) => ({ url: specifier }),
		load: (url: string) => {
			if (sourceMap) {
				(globalThis.__CUCUMBER_TSFLOW_SOURCE_MAPS ??= new Map<string, string>()).set(url, sourceMap);
			}
			return { format: 'module', source: '', shortCircuit: true };
		}
	};
}

describe('source-map-relay', () => {
	it('passes resolve and load through unchanged when no port was received', () => {
		const loader = recordingLoader('{"unrelayed":true}');
		const wrapped = relaySourceMaps(loader);
		expect(wrapped.resolve).to.equal(loader.resolve);
		expect(wrapped.load('file:///a.ts', {}, () => undefined)).to.deep.equal({
			format: 'module',
			source: '',
			shortCircuit: true
		});
	});

	it('posts the map recorded for a loaded module on the port from initialize', () => {
		const { port1, port2 } = new MessageChannel();
		initialize({ tsflowSourceMapPort: port2 });
		try {
			const wrapped = relaySourceMaps(recordingLoader('{"relayed":true}'));
			wrapped.load('file:///b.ts', {}, () => undefined);
			expect(receiveMessageOnPort(port1)?.message).to.deep.equal({
				url: 'file:///b.ts',
				sourceMap: '{"relayed":true}'
			});
			expect(receiveMessageOnPort(port1)).to.equal(undefined);
		} finally {
			port1.close();
		}
	});

	it('posts nothing for a module the loader did not map or delegated as a promise', () => {
		const { port1, port2 } = new MessageChannel();
		initialize({ tsflowSourceMapPort: port2 });
		try {
			relaySourceMaps(recordingLoader(undefined)).load('file:///c.ts', {}, () => undefined);
			const delegating = {
				resolve: () => undefined,
				load: (url: string) => {
					(globalThis.__CUCUMBER_TSFLOW_SOURCE_MAPS ??= new Map<string, string>()).set(url, '{"late":true}');
					return Promise.resolve({ format: 'module', source: '', shortCircuit: true });
				}
			};
			relaySourceMaps(delegating).load('file:///d.ts', {}, () => undefined);
			expect(receiveMessageOnPort(port1)).to.equal(undefined);
		} finally {
			port1.close();
		}
	});
});
