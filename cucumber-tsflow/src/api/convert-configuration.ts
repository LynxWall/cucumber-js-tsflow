import { IConfiguration, isTruthyString, splitFormatDescriptor } from '@cucumber/cucumber/lib/configuration/index';
import { IPublishConfig } from '@cucumber/cucumber/lib/publish/index';
import { ILogger } from '@cucumber/cucumber/lib/environment/index';
import { ITsFlowRunConfiguration } from '../runtime/types';
import { createLogger } from '../utils/tsflow-logger';

const logger = createLogger('convert');

export interface IConfigurationExt extends IConfiguration {
	experimentalDecorators: boolean;
}

export async function convertConfiguration(
	cucumberLogger: ILogger,
	flatConfiguration: IConfigurationExt,
	env: typeof process.env
): Promise<ITsFlowRunConfiguration> {
	logger.checkpoint('convertConfiguration() started');

	try {
		logger.checkpoint('Building sources config', {
			pathCount: flatConfiguration.paths?.length,
			language: flatConfiguration.language
		});
		const sources = {
			paths: flatConfiguration.paths,
			defaultDialect: flatConfiguration.language,
			names: flatConfiguration.name,
			tagExpression: flatConfiguration.tags,
			order: flatConfiguration.order
		};

		logger.checkpoint('Building support config', {
			requireModules: flatConfiguration.requireModule,
			loaders: flatConfiguration.loader
		});
		const support = {
			requireModules: flatConfiguration.requireModule,
			requirePaths: flatConfiguration.require,
			importPaths: flatConfiguration.import,
			loaders: flatConfiguration.loader
		};

		logger.checkpoint('Building runtime config', {
			parallel: flatConfiguration.parallel,
			experimentalDecorators: flatConfiguration.experimentalDecorators
		});
		const runtime = {
			dryRun: flatConfiguration.dryRun,
			experimentalDecorators: flatConfiguration.experimentalDecorators,
			failFast: flatConfiguration.failFast,
			filterStacktraces: !flatConfiguration.backtrace,
			parallel: flatConfiguration.parallel,
			retry: flatConfiguration.retry,
			retryTagFilter: flatConfiguration.retryTagFilter,
			strict: flatConfiguration.strict,
			worldParameters: flatConfiguration.worldParameters
		};

		logger.checkpoint('Building formats config');
		const formats = convertFormats(cucumberLogger, flatConfiguration, env);

		logger.checkpoint('convertConfiguration() completed');

		return {
			sources,
			support,
			runtime,
			formats
		};
	} catch (error: any) {
		logger.error('convertConfiguration() failed', error);
		throw new Error(`Failed to convert configuration: ${error.message}`, { cause: error });
	}
}

function convertFormats(cucumberLogger: ILogger, flatConfiguration: IConfiguration, env: typeof process.env) {
	logger.checkpoint('convertFormats() started', { formatCount: flatConfiguration.format?.length });

	try {
		const splitFormats: string[][] = flatConfiguration.format.map((item, index) => {
			const result = Array.isArray(item) ? item : splitFormatDescriptor(cucumberLogger, item);
			logger.checkpoint(`Format[${index}] processed`, { input: item, output: result });
			return result;
		});

		const stdout = [...splitFormats].reverse().find(([, target]) => !target)?.[0] ?? 'progress';
		logger.checkpoint('Stdout format', { stdout });

		const files = splitFormats
			.filter(([, target]) => !!target)
			.reduce((mapped, [type, target]) => {
				return {
					...mapped,
					[target]: type
				};
			}, {});
		logger.checkpoint('File formats', { files });

		const publish = makePublishConfig(flatConfiguration, env);

		return {
			stdout,
			files,
			publish,
			options: flatConfiguration.formatOptions
		};
	} catch (error: any) {
		logger.error('convertFormats() failed', error);
		throw new Error(`Failed to convert formats: ${error.message}`, { cause: error });
	}
}

function makePublishConfig(flatConfiguration: IConfiguration, env: typeof process.env): IPublishConfig | false {
	const enabled = isPublishing(flatConfiguration, env);
	if (!enabled) {
		return false;
	}
	return {
		url: env.CUCUMBER_PUBLISH_URL,
		token: env.CUCUMBER_PUBLISH_TOKEN
	};
}

function isPublishing(flatConfiguration: IConfiguration, env: typeof process.env): boolean {
	return (
		flatConfiguration.publish ||
		isTruthyString(env.CUCUMBER_PUBLISH_ENABLED) ||
		env.CUCUMBER_PUBLISH_TOKEN !== undefined
	);
}
