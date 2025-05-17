import { IConfiguration, isTruthyString, splitFormatDescriptor } from '@cucumber/cucumber/lib/configuration/index';
import { IPublishConfig } from '@cucumber/cucumber/lib/publish/index';
import { ILogger } from '@cucumber/cucumber/lib/environment/index';

// imports the namespace needed for NodeJS - keeps eslint happy
import NodeJS from 'node:process';
import { ITsFlowRunConfiguration } from '../runtime/types';

export interface IConfigurationExt extends IConfiguration {
	experimentalDecorators: boolean;
}

export async function convertConfiguration(
	logger: ILogger,
	flatConfiguration: IConfigurationExt,
	env: NodeJS.ProcessEnv
): Promise<ITsFlowRunConfiguration> {
	return {
		sources: {
			paths: flatConfiguration.paths,
			defaultDialect: flatConfiguration.language,
			names: flatConfiguration.name,
			tagExpression: flatConfiguration.tags,
			order: flatConfiguration.order
		},
		support: {
			requireModules: flatConfiguration.requireModule,
			requirePaths: flatConfiguration.require,
			importPaths: flatConfiguration.import,
			loaders: flatConfiguration.loader
		},
		runtime: {
			dryRun: flatConfiguration.dryRun,
			experimentalDecorators: flatConfiguration.experimentalDecorators,
			failFast: flatConfiguration.failFast,
			filterStacktraces: !flatConfiguration.backtrace,
			parallel: flatConfiguration.parallel,
			retry: flatConfiguration.retry,
			retryTagFilter: flatConfiguration.retryTagFilter,
			strict: flatConfiguration.strict,
			worldParameters: flatConfiguration.worldParameters
		},
		formats: convertFormats(logger, flatConfiguration, env)
	};
}

function convertFormats(logger: ILogger, flatConfiguration: IConfiguration, env: NodeJS.ProcessEnv) {
	const splitFormats: string[][] = flatConfiguration.format.map(item =>
		Array.isArray(item) ? item : splitFormatDescriptor(logger, item)
	);
	return {
		stdout: [...splitFormats].reverse().find(([, target]) => !target)?.[0] ?? 'progress',
		files: splitFormats
			.filter(([, target]) => !!target)
			.reduce((mapped, [type, target]) => {
				return {
					...mapped,
					[target]: type
				};
			}, {}),
		publish: makePublishConfig(flatConfiguration, env),
		options: flatConfiguration.formatOptions
	};
}

function makePublishConfig(flatConfiguration: IConfiguration, env: NodeJS.ProcessEnv): IPublishConfig | false {
	const enabled = isPublishing(flatConfiguration, env);
	if (!enabled) {
		return false;
	}
	return {
		url: env.CUCUMBER_PUBLISH_URL,
		token: env.CUCUMBER_PUBLISH_TOKEN
	};
}

function isPublishing(flatConfiguration: IConfiguration, env: NodeJS.ProcessEnv): boolean {
	return (
		flatConfiguration.publish ||
		isTruthyString(env.CUCUMBER_PUBLISH_ENABLED) ||
		env.CUCUMBER_PUBLISH_TOKEN !== undefined
	);
}
