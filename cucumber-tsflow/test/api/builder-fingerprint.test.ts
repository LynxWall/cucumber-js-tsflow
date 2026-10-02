import { beforeEach, describe, it } from 'node:test';
import { expect } from 'chai';
import fingerprint from '../../lib/api/builder-fingerprint.js';
import bindings from '../../lib/bindings.js';

const { builderFingerprint, builderInternals, registeredBeyondSteps } = fingerprint;
const builder = bindings.supportCodeLibraryBuilder;
const { methods } = builder;

let ids = 0;
const newId = (): string => String(++ids);

describe('builderFingerprint', () => {
	beforeEach(() => {
		builder.reset(process.cwd(), newId, { requireModules: [], requirePaths: [], importPaths: [], loaders: [] });
	});

	it('counts a step definition as a step and nothing else', () => {
		const before = builderFingerprint();
		methods.Given('a step', () => {});
		const after = builderFingerprint();
		expect(after.steps).to.equal(before.steps + 1);
		expect(after.hooks).to.equal(before.hooks);
		expect(registeredBeyondSteps(before, after)).to.equal(false);
		expect(builderInternals().stepDefinitionConfigs.at(-1)?.pattern).to.equal('a step');
	});

	it('counts every hook kind under hooks', () => {
		const before = builderFingerprint();
		methods.Before(() => {});
		methods.After(() => {});
		methods.BeforeStep(() => {});
		methods.AfterStep(() => {});
		methods.BeforeAll(() => {});
		methods.AfterAll(() => {});
		const after = builderFingerprint();
		expect(after.hooks).to.equal(before.hooks + 6);
		expect(after.steps).to.equal(before.steps);
		expect(registeredBeyondSteps(before, after)).to.equal(true);
	});

	it('sees a parameter type', () => {
		const before = builderFingerprint();
		methods.defineParameterType({ name: 'shade', regexp: /red|green/, transformer: (s: string) => s });
		const after = builderFingerprint();
		expect(after.parameterTypes).to.equal(before.parameterTypes + 1);
		expect(registeredBeyondSteps(before, after)).to.equal(true);
	});

	it('sees a World constructor', () => {
		const before = builderFingerprint();
		methods.setWorldConstructor(class CustomWorld {});
		const after = builderFingerprint();
		expect(after.World).to.not.equal(before.World);
		expect(registeredBeyondSteps(before, after)).to.equal(true);
	});

	it('sees the default timeout', () => {
		const before = builderFingerprint();
		methods.setDefaultTimeout(before.defaultTimeout + 1000);
		expect(registeredBeyondSteps(before, builderFingerprint())).to.equal(true);
	});

	it('sees the parallel assignment predicate', () => {
		const before = builderFingerprint();
		methods.setParallelCanAssign(() => true);
		expect(registeredBeyondSteps(before, builderFingerprint())).to.equal(true);
	});

	it('sees the definition function wrapper', () => {
		const before = builderFingerprint();
		methods.setDefinitionFunctionWrapper((fn: Function) => fn);
		expect(registeredBeyondSteps(before, builderFingerprint())).to.equal(true);
	});

	it('reports no change for two fingerprints of an untouched builder', () => {
		expect(registeredBeyondSteps(builderFingerprint(), builderFingerprint())).to.equal(false);
	});
});
