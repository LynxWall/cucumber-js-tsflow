import { formatLocation, PickleParser } from '@cucumber/cucumber/lib/formatter/helpers/index';
import * as messages from '@cucumber/messages';
import { doesHaveValue } from '@cucumber/cucumber/lib/value_checker';
import JsonFormatter from '@cucumber/cucumber/lib/formatter/json_formatter';
import { ILineAndUri } from '@cucumber/cucumber/lib/types/index';
const { getStepKeyword } = PickleParser;

export interface IJsonFeature {
	description: string;
	elements: IJsonScenario[];
	id: string;
	keyword: string;
	line: number;
	name: string;
	tags: IJsonTag[];
	uri: string;
}

export interface IJsonScenario {
	description: string;
	id: string;
	keyword: string;
	line: number;
	name: string;
	steps: IJsonStep[];
	tags: IJsonTag[];
	type: string;
}

export interface IJsonStep {
	arguments?: any; // TODO
	embeddings?: any; // TODO
	hidden?: boolean;
	keyword?: string; // TODO, not optional
	line?: number;
	match?: any; // TODO
	name?: string;
	result?: any; // TODO
}

export interface IJsonTag {
	name: string;
	line: number;
}
interface IBuildJsonStepOptions {
	isBeforeHook: boolean;
	gherkinStepMap: Record<string, messages.Step>;
	pickleStepMap: Record<string, messages.PickleStep>;
	testStep: messages.TestStep;
	testStepAttachments: messages.Attachment[];
	testStepResult: messages.TestStepResult;
}
export default class BehaveJsonFormatter extends JsonFormatter {
	public static readonly documentation: string = 'Prints the feature as JSON that can be used with Behave Pro';

	getStepData({
		isBeforeHook,
		gherkinStepMap,
		pickleStepMap,
		testStep,
		testStepAttachments,
		testStepResult
	}: IBuildJsonStepOptions): IJsonStep {
		const data: IJsonStep = {};
		if (doesHaveValue(testStep.pickleStepId)) {
			const pickleStep = pickleStepMap[testStep.pickleStepId as string];
			data.arguments = this.formatStepArgument(
				pickleStep.argument as messages.PickleStepArgument,
				gherkinStepMap[pickleStep.astNodeIds[0]]
			);
			data.keyword = getStepKeyword({ pickleStep, gherkinStepMap });
			data.line = gherkinStepMap[pickleStep.astNodeIds[0]].location.line;
			data.name = pickleStep.text;
		} else {
			data.keyword = isBeforeHook ? 'Before' : 'After';
			data.hidden = true;
			data.name = '';
		}
		if (doesHaveValue(testStep.stepDefinitionIds) && testStep.stepDefinitionIds?.length === 1) {
			const stepDefinitionId = testStep.stepDefinitionIds[0];
			const stepDefinition = this.supportCodeLibrary.stepDefinitions.find(s => s.id === stepDefinitionId);
			data.match = { location: formatLocation(stepDefinition as ILineAndUri) };
		}
		const { message, status } = testStepResult;
		data.result = {
			status: messages.TestStepResultStatus[status].toLowerCase()
		};
		if (doesHaveValue(testStepResult.duration)) {
			data.result.duration = messages.TimeConversion.durationToMilliseconds(testStepResult.duration) * 1000000;
		}
		if (status === messages.TestStepResultStatus.FAILED && doesHaveValue(message)) {
			data.result.error_message = message;
		}
		if (testStepAttachments?.length > 0) {
			data.embeddings = testStepAttachments.map(attachment => ({
				data: attachment.body,
				mime_type: attachment.mediaType
			}));
		}
		return data;
	}
}
