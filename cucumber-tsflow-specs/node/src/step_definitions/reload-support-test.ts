import type { ITsFlowLoadSupportOptions } from '@lynxwall/cucumber-tsflow/api';

import { binding, given, then, when } from '@lynxwall/cucumber-tsflow';
import { loadSupport, reloadSupport } from '@lynxwall/cucumber-tsflow/api';
import { expect } from 'chai';

const FIXTURE_NAME = 'reload-fixture';

/** Find the require.cache entry whose key contains the fixture filename. */
function findCacheEntry(): [string, object] | undefined {
	return Object.entries(require.cache).find(([key]) => key.includes(FIXTURE_NAME)) as [string, object] | undefined;
}

/**
 * Scenario context shared across steps within a single scenario.
 */
class ReloadContext {
	public options!: ITsFlowLoadSupportOptions;
	public library: any = null;
	public cacheKey = '';
	public cachedModuleRef: object | null = null;
}

@binding([ReloadContext])
export default class ReloadSupportSteps {
	constructor(private context: ReloadContext) {}

	@given('support options pointing at the reload fixture')
	setupOptions() {
		this.context.options = {
			sources: {
				paths: [],
				defaultDialect: 'en',
				names: [],
				tagExpression: '',
				order: 'defined'
			},
			support: {
				requireModules: [],
				requirePaths: ['./src/fixtures/reload-fixture.ts'],
				importPaths: [],
				loaders: []
			}
		};
	}

	@when('I call loadSupport with the options')
	async callLoadSupport() {
		this.context.library = await loadSupport(this.context.options);
	}

	@given('support code has been loaded')
	async loadSupportCode() {
		this.context.library = await loadSupport(this.context.options);
	}

	@given('the fixture module is cached in require cache')
	captureCache() {
		const entry = findCacheEntry();
		expect(entry, 'fixture should be in require.cache after loadSupport').to.not.be.undefined;
		this.context.cacheKey = entry![0];
		this.context.cachedModuleRef = entry![1];
	}

	@when('I call reloadSupport with no changed paths')
	async fullReload() {
		this.context.library = await reloadSupport(this.context.options, []);
	}

	@when('I call reloadSupport with the fixture as a changed path')
	async selectiveReload() {
		// Use the actual cache key so the eviction logic finds the right entry
		const entry = findCacheEntry();
		expect(entry, 'fixture should be cached before selective reload').to.not.be.undefined;
		this.context.library = await reloadSupport(this.context.options, [entry![0]]);
	}

	@then('the library should contain step definitions')
	verifyStepDefinitions() {
		expect(this.context.library).to.not.be.null;
		expect(this.context.library.stepDefinitions).to.be.an('array');
		expect(this.context.library.stepDefinitions.length).to.be.greaterThan(0);
	}

	@then('the library should contain hook definitions')
	verifyHookDefinitions() {
		expect(this.context.library).to.not.be.null;
		expect(this.context.library.beforeTestCaseHookDefinitions).to.be.an('array');
		expect(this.context.library.beforeTestCaseHookDefinitions.length).to.be.greaterThan(0);
	}

	@then('the fixture module should have been re-evaluated')
	verifyReEvaluation() {
		const entry = findCacheEntry();
		expect(entry, 'fixture should be back in require.cache after reload').to.not.be.undefined;
		// After eviction and re-evaluation the module entry should be a new object
		expect(entry![1]).to.not.equal(this.context.cachedModuleRef);
		// tslint:disable-next-line:no-console
		console.log('reloadSupport successful!');
	}
}
