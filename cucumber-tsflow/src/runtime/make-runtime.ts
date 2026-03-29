import { EventEmitter } from 'node:events';
import { IdGenerator } from '@cucumber/messages';
import { ISourcesCoordinates } from '@cucumber/cucumber/lib/api/index';
import { ILogger } from '@cucumber/cucumber/lib/environment/index';
import { SourcedPickle } from '@cucumber/cucumber/lib/assemble/index';
import { SupportCodeLibrary } from '@cucumber/cucumber/lib/support_code_library_builder/types';
import { IRunEnvironment } from '@cucumber/cucumber/lib/environment/index';
import { Runtime, RuntimeAdapter } from '@cucumber/cucumber/lib/runtime/types';
import type { FormatOptions } from '@cucumber/cucumber/lib/formatter/index';
import { ChildProcessAdapter } from './parallel/adapter';
import { InProcessAdapter } from './serial/adapter';
import { Coordinator } from './coordinator';
import { ITsFlowRunOptionsRuntime } from './types';

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
	coordinates,
	snippetOptions = {}
}: {
	environment: IRunEnvironment;
	logger: ILogger;
	eventBroadcaster: EventEmitter;
	newId: IdGenerator.NewId;
	sourcedPickles: ReadonlyArray<SourcedPickle>;
	supportCodeLibrary: SupportCodeLibrary;
	options: ITsFlowRunOptionsRuntime;
	coordinates: ISourcesCoordinates;
	snippetOptions?: Pick<FormatOptions, 'snippetInterface' | 'snippetSyntax'>;
}): Promise<Runtime> {
	const testRunStartedId = newId();
	const adapter: RuntimeAdapter =
		options.parallel > 0
			? new ChildProcessAdapter(
					testRunStartedId,
					environment,
					logger,
					eventBroadcaster,
					options,
					snippetOptions,
					supportCodeLibrary,
					coordinates
				)
			: new InProcessAdapter(testRunStartedId, eventBroadcaster, newId, options, supportCodeLibrary);
	return new Coordinator(testRunStartedId, eventBroadcaster, newId, sourcedPickles, supportCodeLibrary, adapter);
}
