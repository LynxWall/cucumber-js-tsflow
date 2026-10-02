import { binding, given } from '@lynxwall/cucumber-tsflow';

/**
 * Second fixture binding for the reload-support tests, loaded beside reload-fixture.ts and never named as a
 * changed path by the spec: a reload after a change to the other file must still carry this file's step.
 */
@binding()
export default class ReloadFixtureTwo {
	@given('a second reload fixture step')
	fixtureStep() {
		// no-op; exists so the library has a step definition from a second file to verify
	}
}
