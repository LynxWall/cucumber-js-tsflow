import { binding, before } from '@lynxwall/cucumber-tsflow';
import { Workspace } from './workspace';
import { World } from '@cucumber/cucumber';

@binding([Workspace])
export default class WorldContext {
	_worldObj?: World;

	constructor(private workspace: Workspace) {}

	@before()
	beforeScenario() {
		this.workspace.world = this._worldObj as World;
	}
}
