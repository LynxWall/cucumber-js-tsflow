import { binding, when } from '@lynxwall/cucumber-tsflow';
import { expect } from 'chai';
import { Workspace } from './workspace';

@binding([Workspace])
export default class InjectionTestSteps2 {
	constructor(private workspace: Workspace) {}

	@when('I can see changed state in another step definition class')
	whenIChangeTheWorkspaceInOneStep() {
		expect(this.workspace.someValue).to.equal('value changed');
	}
}
