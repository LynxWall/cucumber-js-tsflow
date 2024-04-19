import { World } from '@cucumber/cucumber';

export class SyncContext {
	public world: World;
	public someValue = '';
	private id: string = '';

	constructor(worldObj: World) {
		this.world = worldObj;
	}

	public initialize(): void {
		this.id = this.makeid(5);
		console.log(`Sync init: ${this.id}`);
	}

	public dispose(): void {
		console.log(`Sync dispose: ${this.id}`);
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
