import { after, before, binding } from '@lynxwall/cucumber-tsflow';
import type { World } from '@lynxwall/cucumber-tsflow';
import { ScenarioContext } from '../fixtures/scenario-context';

@binding([ScenarioContext])
export default class WorldContext {
	_worldObj?: World;

	constructor(protected context: ScenarioContext) {}

	/**
	 * Gets the world object from Cucumber and adds
	 * it to the scenario context so that it's available
	 * in all tests.
	 */
	@before()
	addWorldBeforeAllScenarios() {
		const world = this.context.world;
	}

	/**
	 * Calls the testing-library cleanup function to clear
	 * any rendered components after each scenario. Does not
	 * do anything if a component hasn't been rendered.
	 */
	@after()
	cleanupAfterAllScenarios() {
		const world = this.context.world;
	}
}
