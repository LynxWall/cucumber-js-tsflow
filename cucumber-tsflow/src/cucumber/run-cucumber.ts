import { Envelope, IdGenerator, ParseError } from '@cucumber/messages';
import { EventEmitter } from 'events';
import { EventDataCollector } from '@cucumber/cucumber/lib/formatter/helpers';
import { emitMetaMessage, emitSupportCodeMessages } from '@cucumber/cucumber/lib/cli/helpers';
import { IRunOptions, IRunEnvironment, IRunResult } from '@cucumber/cucumber/lib/api/types';
import { resolvePaths } from '@cucumber/cucumber/lib/api/paths';
import { makeRuntime } from './runtime';
import { initializeFormatters } from '@cucumber/cucumber/lib/api/formatters';
import { getSupportCodeLibrary } from '@cucumber/cucumber/lib/api/support';
import { Console } from 'console';
import { mergeEnvironment } from '@cucumber/cucumber/lib/api/environment';
import { getFilteredPicklesAndErrors } from '@cucumber/cucumber/lib/api/gherkin';
import MessageCollector from './message-collector';

/**
 * Execute a Cucumber test run.
 *
 * Extended from cucumber.js so that we can use our own implementation
 * of makeRuntime
 *
 * @public
 * @param configuration - Configuration loaded from `loadConfiguration`.
 * @param environment - Project environment.
 * @param onMessage - Callback fired each time Cucumber emits a message.
 */
export async function runCucumber(
	configuration: IRunOptions,
	environment: IRunEnvironment = {},
	onMessage?: (message: Envelope) => void
): Promise<IRunResult> {
	const { cwd, stdout, stderr, env } = mergeEnvironment(environment);
	const logger = new Console(stdout, stderr);
	const newId = IdGenerator.uuid();

	const supportCoordinates =
		'World' in configuration.support ? configuration.support.originalCoordinates : configuration.support;

	const { unexpandedFeaturePaths, featurePaths, requirePaths, importPaths } = await resolvePaths(
		cwd,
		configuration.sources,
		supportCoordinates
	);

	const supportCodeLibrary =
		'World' in configuration.support
			? configuration.support
			: await getSupportCodeLibrary({
					cwd,
					newId,
					requirePaths,
					importPaths,
					requireModules: supportCoordinates.requireModules
			  });

	const eventBroadcaster = new EventEmitter();
	if (onMessage) {
		eventBroadcaster.on('envelope', onMessage);
	}
	// create a global instance of the message collector and bind it
	// to the event broadcaster. This is used by cucumber and for tests
	// that are not running in parallel.
	global.messageCollector = new MessageCollector();
	eventBroadcaster.on('envelope', global.messageCollector.parseEnvelope.bind(global.messageCollector));

	let formatterStreamError = false;
	const cleanup = await initializeFormatters({
		env,
		cwd,
		stdout,
		stderr,
		logger,
		onStreamError: () => (formatterStreamError = true),
		eventBroadcaster,
		eventDataCollector: global.messageCollector as unknown as EventDataCollector, // cast the MessageCollector to an EventDataCollector
		configuration: configuration.formats,
		supportCodeLibrary
	});
	await emitMetaMessage(eventBroadcaster, env);

	let pickleIds: string[] = [];
	let parseErrors: ParseError[] = [];
	if (featurePaths.length > 0) {
		const gherkinResult = await getFilteredPicklesAndErrors({
			newId,
			cwd,
			logger,
			unexpandedFeaturePaths,
			featurePaths,
			coordinates: configuration.sources,
			onEnvelope: envelope => eventBroadcaster.emit('envelope', envelope)
		});
		pickleIds = gherkinResult.filteredPickles.map(({ pickle }) => pickle.id);
		parseErrors = gherkinResult.parseErrors;
	}
	if (parseErrors.length) {
		parseErrors.forEach(parseError => {
			logger.error(`Parse error in "${parseError.source.uri}" ${parseError.message}`);
		});
		await cleanup();
		return {
			success: false,
			support: supportCodeLibrary
		};
	}

	emitSupportCodeMessages({
		eventBroadcaster,
		supportCodeLibrary,
		newId
	});

	const runtime = makeRuntime({
		cwd,
		logger,
		eventBroadcaster,
		eventDataCollector: global.messageCollector as unknown as EventDataCollector, // cast the MessageCollector to an EventDataCollector
		pickleIds,
		newId,
		supportCodeLibrary,
		requireModules: supportCoordinates.requireModules,
		requirePaths,
		importPaths,
		options: configuration.runtime
	});
	const success = await runtime.start();
	await cleanup();

	return {
		success: success && !formatterStreamError,
		support: supportCodeLibrary
	};
}
