import { after, before, binding, given, then, when } from 'cucumber-tsflow';
import * as expect from 'expect';

@binding()
export default class TestSteps {
	private givenIsCalled = false;
	private beforeIsCalled = false;
	private whenIsCalled = false;
	private thenIsCalled = false;
	private beforeWithNoTagIsCalled = false;

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
		expect(this.beforeWithNoTagIsCalled).toBe(true);
		expect(this.beforeIsCalled).toBe(true);
		expect(this.whenIsCalled).toBe(true);
		expect(this.givenIsCalled).toBe(true);
		expect(this.thenIsCalled).toBe(true);
		// tslint:disable-next-line:no-console
		console.log('@basic after hook is called.');
	}

	@after('@tag1')
	afterForTagging() {
		// this is not called by tagging feature.
		expect(this.beforeIsCalled).toBe(false);
		expect(this.beforeWithNoTagIsCalled).toBe(true);
		expect(this.whenIsCalled).toBe(true);
		expect(this.givenIsCalled).toBe(true);
		expect(this.thenIsCalled).toBe(true);
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
}
