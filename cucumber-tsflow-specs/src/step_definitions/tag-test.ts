import { after, binding, beforeAll, given, then, when } from '@lynxwall/cucumber-tsflow';
import * as expect from 'expect';

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
		expect(beforeAllCalled).toBe(true);
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
		expect(this.whenIsCalled).toBe(true);
		expect(this.givenIsCalled).toBe(true);
		expect(this.thenIsCalled).toBe(true);
		// tslint:disable-next-line:no-console
		console.log('@tagging afterTag method is called');
	}
}
