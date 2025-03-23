import { EventEmitter } from 'node:events';
import { IdGenerator } from '@cucumber/messages';
import { IRunOptionsRuntime, ISourcesCoordinates } from '@cucumber/cucumber/lib/api/index';
import { ILogger } from '@cucumber/cucumber/lib/environment/index';
import { SourcedPickle } from '@cucumber/cucumber/lib/assemble/index';
import { SupportCodeLibrary } from '@cucumber/cucumber/lib/support_code_library_builder/types';
import { IRunEnvironment } from '@cucumber/cucumber/lib/environment/index';
import { Runtime, RuntimeAdapter } from '@cucumber/cucumber/lib/runtime/types';
import { ChildProcessAdapter } from './parallel/adapter';
import { InProcessAdapter } from './serial/adapter';
import { Coordinator } from './coordinator';

/**
 * Extending this function from cucumber.js to use our own implementation
 * of the Coordinator.
 */
export async function makeRuntime({
	environment,
	logger,
	eventBroadcaster,
	sourcedPickles,
	newId,
	supportCodeLibrary,
	options,
	coordinates
}: {
	environment: IRunEnvironment;
	logger: ILogger;
	eventBroadcaster: EventEmitter;
	newId: IdGenerator.NewId;
	sourcedPickles: ReadonlyArray<SourcedPickle>;
	supportCodeLibrary: SupportCodeLibrary;
	options: IRunOptionsRuntime;
	coordinates: ISourcesCoordinates;
}): Promise<Runtime> {
	const adapter: RuntimeAdapter =
		options.parallel > 0
			? new ChildProcessAdapter(environment, logger, eventBroadcaster, options, supportCodeLibrary, coordinates)
			: new InProcessAdapter(eventBroadcaster, newId, options, supportCodeLibrary);
	return new Coordinator(eventBroadcaster, newId, sourcedPickles, supportCodeLibrary, adapter);
}
