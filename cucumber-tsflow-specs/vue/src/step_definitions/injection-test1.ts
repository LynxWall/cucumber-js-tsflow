import { binding, given, when } from '@lynxwall/cucumber-tsflow';
import { Workspace } from './workspace';
import { expect } from 'chai';

@binding([Workspace])
export default class InjectionTestSteps1 {
	constructor(private workspace: Workspace) {}

	@given('The Workspace is available and valid')
	theWorkspaceIsAvailableAndValid() {
		expect(this.workspace).not.to.be.undefined;
		expect(this.workspace.world).not.to.be.undefined;
	}

	@when('I change the workspace in one step definition class')
	whenIChangeTheWorkspaceInOneStep() {
		this.workspace.someValue = 'value changed';
	}
}
