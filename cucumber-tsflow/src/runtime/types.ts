import * as messages from '@cucumber/messages';
import { FinalizeCommand, InitializeCommand, RunCommand } from '@cucumber/cucumber/lib/runtime/parallel/types';
import { IRunConfiguration, IRunOptionsRuntime, ISourcesCoordinates } from '@cucumber/cucumber/api';
import { RuntimeOptions } from '@cucumber/cucumber/lib/runtime/types';

export interface IMessageData {
	gherkinDocumentMap: Record<string, messages.GherkinDocument>;
	pickleMap: Record<string, messages.Pickle>;
	testCaseMap: Record<string, messages.TestCase>;
	coordinates: ISourcesCoordinates;
}

export interface ITsFlowRunOptionsRuntime extends IRunOptionsRuntime {
	experimentalDecorators: boolean;
}
export interface ITsFlowRunConfiguration extends IRunConfiguration {
	runtime: ITsFlowRunOptionsRuntime;
}

export interface TsFlowRuntimeOptions extends RuntimeOptions {
	experimentalDecorators: boolean;
}

export interface InitializeTsflowCommand extends InitializeCommand {
	messageData: IMessageData;
	options: TsFlowRuntimeOptions;
}

export type CoordinatorToWorkerCommand = InitializeTsflowCommand | RunCommand | FinalizeCommand;
