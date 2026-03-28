"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertConfiguration = convertConfiguration;
const index_1 = require("@cucumber/cucumber/lib/configuration/index");
const tsflow_logger_1 = require("../utils/tsflow-logger");
const logger = (0, tsflow_logger_1.createLogger)('convert');
async function convertConfiguration(cucumberLogger, flatConfiguration, env) {
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
            parallelLoad: flatConfiguration.parallelLoad,
            experimentalDecorators: flatConfiguration.experimentalDecorators
        });
        const runtime = {
            dryRun: flatConfiguration.dryRun,
            experimentalDecorators: flatConfiguration.experimentalDecorators,
            failFast: flatConfiguration.failFast,
            filterStacktraces: !flatConfiguration.backtrace,
            parallel: flatConfiguration.parallel,
            parallelLoad: flatConfiguration.parallelLoad,
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
    }
    catch (error) {
        logger.error('convertConfiguration() failed', error);
        throw new Error(`Failed to convert configuration: ${error.message}`, { cause: error });
    }
}
function convertFormats(cucumberLogger, flatConfiguration, env) {
    logger.checkpoint('convertFormats() started', { formatCount: flatConfiguration.format?.length });
    try {
        const splitFormats = flatConfiguration.format.map((item, index) => {
            const result = Array.isArray(item) ? item : (0, index_1.splitFormatDescriptor)(cucumberLogger, item);
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
    }
    catch (error) {
        logger.error('convertFormats() failed', error);
        throw new Error(`Failed to convert formats: ${error.message}`, { cause: error });
    }
}
function makePublishConfig(flatConfiguration, env) {
    const enabled = isPublishing(flatConfiguration, env);
    if (!enabled) {
        return false;
    }
    return {
        url: env.CUCUMBER_PUBLISH_URL,
        token: env.CUCUMBER_PUBLISH_TOKEN
    };
}
function isPublishing(flatConfiguration, env) {
    return (flatConfiguration.publish ||
        (0, index_1.isTruthyString)(env.CUCUMBER_PUBLISH_ENABLED) ||
        env.CUCUMBER_PUBLISH_TOKEN !== undefined);
}
//# sourceMappingURL=convert-configuration.js.map