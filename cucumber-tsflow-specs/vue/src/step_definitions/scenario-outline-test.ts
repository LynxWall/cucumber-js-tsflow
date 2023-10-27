import { binding, given, then, when } from '@lynxwall/cucumber-tsflow';
import { expect } from 'chai';

@binding()
export default class ScenarioOutlineTest {
	private currentModule: string = '';
	private currentButton: string = '';
	private pageArray = ['RED', 'BLUE', 'YELLOW', 'INFO'];

	@given('A student has selected the {string} module')
	aStudentHasSelectedTheCourseScheduleModule(module: string): any {
		this.currentModule = module;
	}
	@then('The {string} module is available')
	theStringModuleIsAvailable(module: string): any {
		expect(module).to.equal(this.currentModule);
	}

	@given('I push the {string} button')
	iPushThebuttonButton(button: string): any {
		this.currentButton = button;
		expect(this.currentButton).not.to.be.empty.string;
	}

	@then('I should see the {int} page')
	iShouldSeeTheintPage(pageIdx: number): any {
		const pageFromArray = this.pageArray[pageIdx];
		expect(pageFromArray).to.equal(this.currentButton);
	}
}
