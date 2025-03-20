import * as messages from '@cucumber/messages';
import { FinalizeCommand, InitializeCommand, RunCommand } from '@cucumber/cucumber/lib/runtime/parallel/types';

export interface IMessageData {
	gherkinDocumentMap: Record<string, messages.GherkinDocument>;
	pickleMap: Record<string, messages.Pickle>;
	testCaseMap: Record<string, messages.TestCase>;
}

export interface InitializeTsflowCommand extends InitializeCommand {
	collectorData: IMessageData;
}

export type CoordinatorToWorkerCommand = InitializeTsflowCommand | RunCommand | FinalizeCommand;
