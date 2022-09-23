import Runtime, { IRuntime } from '@cucumber/cucumber/lib/runtime/index';
import { EventEmitter } from 'events';
import { EventDataCollector } from '@cucumber/cucumber/lib/formatter/helpers';
import { IdGenerator } from '@cucumber/messages';
import { ISupportCodeLibrary } from '@cucumber/cucumber/lib/support_code_library_builder/types';
import Coordinator from './parallel/coordinator';
import { IRunOptionsRuntime } from '@cucumber/cucumber/lib/api/types';
import { ILogger } from '@cucumber/cucumber/lib/logger';

/**
 * Extending this function from cucumber.js to use our own implementation
 * of the Coordinator.
 */
export function makeRuntime({
	cwd,
	logger,
	eventBroadcaster,
	eventDataCollector,
	pickleIds,
	newId,
	supportCodeLibrary,
	requireModules,
	requirePaths,
	importPaths,
	options: { parallel, ...options }
}: {
	cwd: string;
	logger: ILogger;
	eventBroadcaster: EventEmitter;
	eventDataCollector: EventDataCollector;
	newId: IdGenerator.NewId;
	pickleIds: string[];
	supportCodeLibrary: ISupportCodeLibrary;
	requireModules: string[];
	requirePaths: string[];
	importPaths: string[];
	options: IRunOptionsRuntime;
}): IRuntime {
	if (parallel > 0) {
		return new Coordinator({
			cwd,
			logger,
			eventBroadcaster,
			eventDataCollector,
			pickleIds,
			options,
			newId,
			supportCodeLibrary,
			requireModules,
			requirePaths,
			importPaths,
			numberOfWorkers: parallel
		});
	}
	return new Runtime({
		eventBroadcaster,
		eventDataCollector,
		newId,
		pickleIds,
		supportCodeLibrary,
		options
	});
}
