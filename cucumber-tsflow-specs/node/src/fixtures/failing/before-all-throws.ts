import { beforeAll, binding } from '@lynxwall/cucumber-tsflow';

/**
 * A BeforeAll hook that throws, for the spec that asserts a failing test-run hook fails the run. The spec pins
 * the line of the decorator below, so keep this file's header as it is.
 */
@binding()
export default class BeforeAllThrows {
	@beforeAll()
	explode(): void {
		throw new Error('the BeforeAll hook failed on purpose');
	}
}
