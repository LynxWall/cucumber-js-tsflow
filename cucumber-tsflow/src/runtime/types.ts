import * as messages from '@cucumber/messages';
import {
	FinalizeCommand,
	InitializeCommand,
	RunCommand,
	WorkerToCoordinatorEvent
} from '@cucumber/cucumber/lib/runtime/parallel/types';
import { IRunConfiguration, IRunOptionsRuntime, ISourcesCoordinates } from '@cucumber/cucumber/api';
import { RuntimeOptions } from '@cucumber/cucumber/lib/runtime/types';
import type { TimingSnapshot } from '../utils/tsflow-timing';

export interface IMessageData {
	gherkinDocumentMap: Record<string, messages.GherkinDocument>;
	pickleMap: Record<string, messages.Pickle>;
	testCaseMap: Record<string, messages.TestCase>;
	coordinates: ISourcesCoordinates;
}

export interface ITsFlowRunOptionsRuntime extends IRunOptionsRuntime {
	experimentalDecorators: boolean;
	parallelLoad: boolean | number;
}
export interface ITsFlowRunConfiguration extends IRunConfiguration {
	runtime: ITsFlowRunOptionsRuntime;
}

export interface TsFlowRuntimeOptions extends RuntimeOptions {
	experimentalDecorators: boolean;
	parallelLoad: boolean | number;
}

export interface InitializeTsflowCommand extends InitializeCommand {
	messageData: IMessageData;
	options: TsFlowRuntimeOptions;
}

export type CoordinatorToWorkerCommand = InitializeTsflowCommand | RunCommand | FinalizeCommand;

/** Startup timings from a parallel child process, sent before READY when TSFLOW_TIMING=true */
export interface TimingEvent {
	type: 'TIMING';
	workerId: string;
	snapshot: TimingSnapshot;
}

export type TsFlowWorkerToCoordinatorEvent = WorkerToCoordinatorEvent | TimingEvent;
