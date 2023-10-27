import {
	beforeAll,
	afterAll,
	after,
	afterStep,
	before,
	beforeStep,
	binding,
	given,
	then,
	when
} from '@lynxwall/cucumber-tsflow';
import { expect } from 'chai';

@binding()
export default class TestSteps {
	private givenIsCalled = false;
	private beforeIsCalled = false;
	private whenIsCalled = false;
	private thenIsCalled = false;
	private beforeStepIsCalled = false;
	private stepIsCalled = false;
	private beforeWithNoTagIsCalled = false;
	private computedResult = 0;
	private boolValue: any = undefined;

	@beforeAll()
	beforeAll() {
		console.log('beforeAll was called');
	}
	@afterAll()
	afterAll() {
		console.log('afterAll was called');
	}

	@before()
	beforeWithNoTag() {
		this.beforeWithNoTagIsCalled = true;
	}

	@before('@basic')
	beforeBasic() {
		this.beforeIsCalled = true;
	}

	@beforeStep('@addNumbers')
	beforeStep() {
		this.beforeStepIsCalled = true;
	}

	@afterStep('@addNumbers')
	afterStep() {
		expect(this.beforeStepIsCalled).to.be.true;
		expect(this.stepIsCalled).to.be.true;
		this.stepIsCalled = false;
		this.beforeStepIsCalled = false;
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
		//test updates
		this.thenIsCalled = true;
	}

	@given('I enter {int} and {int}')
	iEnterintAndint(int: number, int2: number): any {
		this.computedResult = int + int2;
		expect(this.beforeStepIsCalled).to.be.true;
		this.stepIsCalled = true;
		this.givenIsCalled = true;
	}

	@when('checking the results')
	checkingTheResults(): any {
		expect(this.computedResult).to.be.greaterThan(0);
		expect(this.beforeStepIsCalled).to.be.true;
		this.stepIsCalled = true;
		this.whenIsCalled = true;
	}

	@then('I receive the result {int}')
	iReceiveTheResultint(int: number): any {
		if (int !== this.computedResult) {
			throw new Error('Arithmetic Error');
		}
		expect(this.beforeStepIsCalled).to.be.true;
		this.stepIsCalled = true;
		this.thenIsCalled = true;
		// throw 'error';
		// return 'pending';
	}

	@given('I pass {boolean} into a step')
	iPassbooleanIntoAStep(boolean: boolean): any {
		this.boolValue = boolean;
		this.givenIsCalled = true;
	}

	@when('checking the boolean value')
	checkingTheBooleanValue(): any {
		expect(this.boolValue).not.to.be.undefined;
		this.whenIsCalled = true;
	}

	@then('we can see that {boolean} was passed in')
	weCanThatbooleanWasPassedIn(boolean: boolean): any {
		expect(this.boolValue).to.equal(boolean);
		this.thenIsCalled = true;
	}
}
