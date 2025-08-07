import { binding, given, when } from '@lynxwall/cucumber-tsflow';
import { ScenarioContext } from '../fixtures/scenario-context.ts';
import { SyncContext } from '../fixtures/sync-context.ts';
import { expect } from 'chai';

@binding([ScenarioContext, SyncContext])
export default class InjectionTestSteps1 {
	constructor(
		private context: ScenarioContext,
		private syncContext: SyncContext
	) {}

	@given('The Workspace is available and valid')
	theWorkspaceIsAvailableAndValid() {
		expect(this.context).not.to.be.undefined;
		expect(this.context.world).not.to.be.undefined;

		expect(this.syncContext).not.to.be.undefined;
		expect(this.syncContext.world).not.to.be.undefined;
	}

	@when('I change the workspace in one step definition class')
	whenIChangeTheWorkspaceInOneStep() {
		this.context.someValue = 'value changed';
	}
}
