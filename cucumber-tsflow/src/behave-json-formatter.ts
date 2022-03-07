import JsonFormatter, { IJsonStep } from '@cucumber/cucumber/lib/formatter/json_formatter';
import * as messages from '@cucumber/messages';
import { doesHaveValue } from '@cucumber/cucumber/lib/value_checker';
import { formatLocation, PickleParser } from '@cucumber/cucumber/lib/formatter/helpers';
import { ILineAndUri } from '@cucumber/cucumber/lib/types';
import { PickleStepArgument } from '@cucumber/messages';
const { getStepKeyword } = PickleParser;

interface IBuildJsonStepOptions {
	isBeforeHook: boolean;
	gherkinStepMap: Record<string, messages.Step>;
	pickleStepMap: Record<string, messages.PickleStep>;
	testStep: messages.TestStep;
	testStepAttachments: messages.Attachment[];
	testStepResult: messages.TestStepResult;
}

/**
 * Extending JsonFormatter.getStepData to add a name field to 	before
 * and After steps so that json can be exported to Behave Pro (name on steps required)
 */
export default class BehaveJsonFormatter extends JsonFormatter {
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
				pickleStep.argument as PickleStepArgument,
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
			const stepDefinition = this.supportCodeLibrary.stepDefinitions.find(
				s => s.id === (testStep.stepDefinitionIds as string[])[0]
			);
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
