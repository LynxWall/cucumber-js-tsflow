import { World } from '@cucumber/cucumber';

export class ScenarioContext {
	public world: World;
	public someValue = '';

	constructor(worldObj: World) {
		this.world = worldObj;
	}

	public dispose(): void {
		this.someValue = '';
	}
}
