import { after, before, binding, given, then, when } from '@lynxwall/cucumber-tsflow';
import { expect } from 'chai';

@binding()
export default class TestSteps {
	private givenIsCalled = false;
	private beforeIsCalled = false;
	private whenIsCalled = false;
	private thenIsCalled = false;
	private beforeWithNoTagIsCalled = false;
	private computedResult = 0;

	@before()
	beforeWithNoTag() {
		this.beforeWithNoTagIsCalled = true;
	}

	@before('@basic')
	beforeBasic() {
		this.beforeIsCalled = true;
	}

	@after('@basic')
	afterBasic() {
		expect(this.beforeWithNoTagIsCalled).to.be.true;
		expect(this.beforeIsCalled).to.be.true;
		expect(this.whenIsCalled).to.be.true;
		expect(this.givenIsCalled).to.be.true;
		expect(this.thenIsCalled).to.be.true;
		// tslint:disable-next-line:no-console
		console.log('@basic after hook is called.');
	}

	@after('@tag1')
	afterForTagging() {
		// this is not called by tagging feature.
		expect(this.beforeIsCalled).to.be.false;
		expect(this.beforeWithNoTagIsCalled).to.be.true;
		expect(this.whenIsCalled).to.be.true;
		expect(this.givenIsCalled).to.be.true;
		expect(this.thenIsCalled).to.be.true;
		// tslint:disable-next-line:no-console
		console.log('@tags1 after hook is called.');
	}

	@given('some step to be executed')
	someStepToBeExecuted(): any {
		this.givenIsCalled = true;
	}

	@when('the condition is right')
	whenTheConditionIsRight() {
		this.whenIsCalled = true;
	}

	@then('we can see the result correctly')
	thenWeCanSeeTheResult() {
		this.thenIsCalled = true;
	}

	@given('I enter {string} and {string}')
	iEnterstringAndstring(num1: string, num2: string): any {
		this.computedResult = parseInt(num1) + parseInt(num2);
		this.givenIsCalled = true;
	}

	@when('checking the results')
	checkingTheResults(): any {
		this.whenIsCalled = true;
	}

	@then('I receive the result {string}')
	iReceiveTheResultstring(expectedResult: string): any {
		if (parseInt(expectedResult) !== this.computedResult) {
			throw new Error('Arithmetic Error');
		}
		this.thenIsCalled = true;
	}
}
