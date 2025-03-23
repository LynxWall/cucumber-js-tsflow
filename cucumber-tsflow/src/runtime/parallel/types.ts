import * as messages from '@cucumber/messages';
import { FinalizeCommand, InitializeCommand, RunCommand } from '@cucumber/cucumber/lib/runtime/parallel/types';
import { ISourcesCoordinates } from '@cucumber/cucumber/api';

export interface IMessageData {
	gherkinDocumentMap: Record<string, messages.GherkinDocument>;
	pickleMap: Record<string, messages.Pickle>;
	testCaseMap: Record<string, messages.TestCase>;
	coordinates: ISourcesCoordinates;
}

export interface InitializeTsflowCommand extends InitializeCommand {
	messageData: IMessageData;
}

export type CoordinatorToWorkerCommand = InitializeTsflowCommand | RunCommand | FinalizeCommand;
