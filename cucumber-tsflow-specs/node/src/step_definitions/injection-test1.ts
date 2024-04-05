import { binding, given, when } from '@lynxwall/cucumber-tsflow';
import { ScenarioContext } from '../fixtures/scenario-context';
import { expect } from 'chai';

@binding([ScenarioContext])
export default class InjectionTestSteps1 {
	constructor(private context: ScenarioContext) {}

	@given('The Workspace is available and valid')
	theWorkspaceIsAvailableAndValid() {
		expect(this.context).not.to.be.undefined;
		expect(this.context.world).not.to.be.undefined;
	}

	@when('I change the workspace in one step definition class')
	whenIChangeTheWorkspaceInOneStep() {
		this.context.someValue = 'value changed';
	}
}
