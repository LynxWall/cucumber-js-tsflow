import { World } from '@cucumber/cucumber';
import { EndTestCaseInfo, StartTestCaseInfo } from '@lynxwall/cucumber-tsflow/lib/cucumber/test-case-info';

export class SyncContext {
	public world: World;
	public someValue = '';
	private id: string = '';

	constructor(worldObj: World) {
		this.world = worldObj;
	}

	public initialize({ pickle, gherkinDocument }: StartTestCaseInfo): void {
		this.id = this.makeid(5);
		console.log(`Sync init: ${this.id}`);
		console.log(`Start Test Case: ${this.getFeatureAndScenario(gherkinDocument.uri!, pickle.name)}`);
	}

	public dispose({ pickle, gherkinDocument }: EndTestCaseInfo): void {
		console.log(`Sync dispose: ${this.id}`);
		console.log(`End Test Case: ${this.getFeatureAndScenario(gherkinDocument.uri!, pickle.name)}`);
	}

	private getFeatureAndScenario(path: string, scenario: string): string | undefined {
		let fileName: string | undefined = path;
		if (path.indexOf('\\') > 0) {
			fileName = path.split('\\').pop();
		} else {
			fileName = path.split('/').pop();
		}
		return `${fileName}: ${scenario.split(' ').join('-')}`;
	}

	private makeid(length: number) {
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
