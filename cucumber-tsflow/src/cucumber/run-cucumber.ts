import { Envelope, IdGenerator, ParseError } from '@cucumber/messages';
import { EventEmitter } from 'events';
import { EventDataCollector } from '@cucumber/cucumber/lib/formatter/helpers';
import { emitMetaMessage, emitSupportCodeMessages } from '@cucumber/cucumber/lib/cli/helpers';
import { IRunOptions, IRunResult } from '@cucumber/cucumber/lib/api/types';
import { resolvePaths } from '@cucumber/cucumber/lib/paths';
import { SupportCodeLibrary } from '@cucumber/cucumber/lib/support_code_library_builder/types'
import { makeRuntime } from './make-runtime';
import { initializeFormatters } from '@cucumber/cucumber/lib/api/formatters';
import { getSupportCodeLibrary } from '@cucumber/cucumber/lib/api/support';
import { IRunEnvironment, makeEnvironment } from '@cucumber/cucumber/lib/environment';
import { getPicklesAndErrors } from '@cucumber/cucumber/lib/api/gherkin';
import MessageCollector from './message-collector';
import { version } from '../version'
import { initializeForRunCucumber } from '@cucumber/cucumber/lib/api/plugins'
import { IFilterablePickle } from '@cucumber/cucumber/lib/filter';


/**
 * Execute a Cucumber test run.
 *
 * Extended from cucumber.js so that we can use our own implementation
 * of makeRuntime
 *
 * @public
 * @param options - Configuration loaded from `loadConfiguration`.
 * @param environment - Project environment.
 * @param onMessage - Callback fired each time Cucumber emits a message.
 */
export async function runCucumber(
	options: IRunOptions,
	environment: IRunEnvironment = {},
	onMessage?: (message: Envelope) => void
): Promise<IRunResult> {
  const mergedEnvironment = makeEnvironment(environment)
  const { cwd, stdout, stderr, env, logger } = mergedEnvironment

  logger.debug(`Running cucumber-tsflow ${version}
Working directory: ${cwd}
Running from: ${__dirname}
`)

	const newId = IdGenerator.uuid();

  const supportCoordinates =
    'originalCoordinates' in options.support
      ? options.support.originalCoordinates
      : Object.assign(
          {
            requireModules: [],
            requirePaths: [],
            loaders: [],
            importPaths: [],
          },
          options.support
        )

  const pluginManager = await initializeForRunCucumber(
    {
      ...options,
      support: supportCoordinates,
    },
    mergedEnvironment
  )

  const resolvedPaths = await resolvePaths(
    logger,
    cwd,
    options.sources,
    supportCoordinates
  )
  pluginManager.emit('paths:resolve', resolvedPaths)
  const { sourcePaths, requirePaths, importPaths } = resolvedPaths

  const supportCodeLibrary =
    'originalCoordinates' in options.support
      ? (options.support as SupportCodeLibrary)
      : await getSupportCodeLibrary({
          logger,
          cwd,
          newId,
          requirePaths,
          requireModules: supportCoordinates.requireModules,
          importPaths,
          loaders: supportCoordinates.loaders,
        })

	const eventBroadcaster = new EventEmitter();
	if (onMessage) {
		eventBroadcaster.on('envelope', onMessage);
	}
  eventBroadcaster.on('envelope', (value) =>
    pluginManager.emit('message', value)
  )

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
		configuration: options.formats,
		supportCodeLibrary,
		pluginManager
	});
	await emitMetaMessage(eventBroadcaster, env);

  let filteredPickles: ReadonlyArray<IFilterablePickle> = []
	let parseErrors: ParseError[] = [];
	if (sourcePaths.length > 0) {
		const gherkinResult = await getPicklesAndErrors({
			newId,
			cwd,
      sourcePaths,
      coordinates: options.sources,
      onEnvelope: (envelope) => eventBroadcaster.emit('envelope', envelope),
		});
    filteredPickles = await pluginManager.transform(
      'pickles:filter',
      gherkinResult.filterablePickles
    )
    filteredPickles = await pluginManager.transform(
      'pickles:order',
      filteredPickles
    )
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

	const runtime = await makeRuntime({
    environment,
    logger,
    eventBroadcaster,
    sourcedPickles: filteredPickles,
    newId,
    supportCodeLibrary,
    options: options.runtime,
	});
	const success = await runtime.run();
	await cleanup();

	return {
		success: success && !formatterStreamError,
		support: supportCodeLibrary
	};
}
