import { World } from '@cucumber/cucumber';

export class ScenarioContext {
	public world: World;
	public someValue = '';
	private id: string = '';

	constructor(worldObj: World) {
		this.world = worldObj;
	}

	public async initialize(): Promise<void> {
		this.id = this.makeid(5);
		await this.logTest(`Async init: ${this.id}`);
	}

	public async dispose(): Promise<void> {
		await this.logTest(`Async dispose: ${this.id}`);
	}

	async logTest(text: string): Promise<void> {
		await Promise.resolve(console.log(text));
	}

	makeid(length: number) {
		let result = '';
		const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		const charactersLength = characters.length;
		let counter = 0;
		while (counter < length) {
			result += characters.charAt(Math.floor(Math.random() * charactersLength));
			counter += 1;
		}
		return result;
	}
}
