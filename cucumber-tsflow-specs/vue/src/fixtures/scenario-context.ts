import { World } from '@cucumber/cucumber';
import { StartTestCaseInfo, EndTestCaseInfo } from '@lynxwall/cucumber-tsflow';

export class ScenarioContext {
	public world: World;
	public someValue = '';
	private id: string = '';

	constructor(worldObj: World) {
		this.world = worldObj;
	}

	public async initialize({ pickle, gherkinDocument }: StartTestCaseInfo): Promise<void> {
		this.id = this.makeid(5);
		await this.logTest(`Async init: ${this.id}`);
		await this.logTest(`Start Test Case: ${this.getFeatureAndScenario(gherkinDocument.uri!, pickle.name)}`);
	}

	public async dispose({ pickle, gherkinDocument }: EndTestCaseInfo): Promise<void> {
		await this.logTest(`Async dispose: ${this.id}`);
		await this.logTest(`End Test Case: ${this.getFeatureAndScenario(gherkinDocument.uri!, pickle.name)}`);
	}

	private async logTest(text: string): Promise<void> {
		await Promise.resolve(console.log(text));
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
