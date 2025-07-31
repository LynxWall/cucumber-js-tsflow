import { binding, before } from '@lynxwall/cucumber-tsflow';
import { ScenarioContext } from '../fixtures/scenario-context.ts';
import { World } from '@cucumber/cucumber';

@binding([ScenarioContext])
export default class WorldContext {
	_worldObj?: World;

	constructor(private context: ScenarioContext) {}

	@before()
	beforeScenario() {
		this.context.world = this._worldObj as World;
	}
}
