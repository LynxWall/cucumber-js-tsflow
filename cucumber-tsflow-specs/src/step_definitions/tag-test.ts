import { after, binding, beforeAll, given, then, when } from '@lynxwall/cucumber-tsflow';
import { expect } from 'chai';

let beforeAllCalled = false;

@binding()
export default class TestSteps {
	private whenIsCalled = false;
	private givenIsCalled = false;
	private thenIsCalled = false;

	@beforeAll()
	static beforeAll() {
		beforeAllCalled = true;
	}
	@given('some step to be executed with tag', '@tag2')
	givenSomeStepTobeExecuted() {
		this.givenIsCalled = true;
		expect(beforeAllCalled).to.be.true;
	}

	@when('the condition is right with tag', '@tag2')
	whenTheConditionIsRight() {
		this.whenIsCalled = true;
	}

	@then('we can see the result correctly with tag', '@tag2')
	thenWeCanSeeTheResult() {
		this.thenIsCalled = true;
	}

	@after('@tag2')
	afterTag() {
		expect(this.whenIsCalled).to.be.true;
		expect(this.givenIsCalled).to.be.true;
		expect(this.thenIsCalled).to.be.true;
		// tslint:disable-next-line:no-console
		console.log('@tagging afterTag method is called');
	}
}
