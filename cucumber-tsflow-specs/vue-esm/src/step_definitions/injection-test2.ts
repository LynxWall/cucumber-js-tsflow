import { binding, then } from '@lynxwall/cucumber-tsflow';
import { expect } from 'chai';
import { ScenarioContext } from '@fixtures/scenario-context';

@binding([ScenarioContext])
export default class InjectionTestSteps2 {
	constructor(private context: ScenarioContext) {}

	@then('I can see changed state in another step definition class')
	whenIChangeTheWorkspaceInOneStep() {
		expect(this.context.someValue).to.equal('value changed');
	}
}
