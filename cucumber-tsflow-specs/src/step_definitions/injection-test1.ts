import { binding, when } from '@lynxwall/cucumber-tsflow';
import { Workspace } from './workspace';

@binding([Workspace])
export default class InjectionTestSteps2 {
	constructor(private workspace: Workspace) {}

	@when('I change the workspace in one step definition class')
	whenIChangeTheWorkspaceInOneStep() {
		this.workspace.someValue = 'value changed';
	}
}
