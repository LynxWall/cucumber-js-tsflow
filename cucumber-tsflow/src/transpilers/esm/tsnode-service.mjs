import { createRequire } from 'module';
import { createLogger } from '../../utils/tsflow-logger.mjs';

const logger = createLogger('tsnode-service');

logger.checkpoint('Loading ts-node-maintained');

const require = createRequire(import.meta.url);

let tsNode;
try {
	tsNode = require('ts-node-maintained');
	logger.checkpoint('ts-node-maintained loaded successfully');
} catch (error) {
	logger.error('Failed to load ts-node-maintained', error);
	throw new Error(`Failed to load ts-node-maintained: ${error.message}`, { cause: error });
}

// Cache for different ts-node configurations
const serviceCache = new Map();

export function createTsNodeService(options = {}) {
	logger.checkpoint('createTsNodeService called', { options });

	const cacheKey = JSON.stringify(options);

	if (serviceCache.has(cacheKey)) {
		logger.checkpoint('Returning cached ts-node service', { cacheKey });
		return serviceCache.get(cacheKey);
	}

	// Ensure ts-node respects tsconfig.json files
	process.env.TS_NODE_FILES = process.env.TS_NODE_FILES || 'true';

	const experimentalDecorators = process.env.CUCUMBER_EXPERIMENTAL_DECORATORS === 'true';

	const defaultOptions = {
		esm: true,
		experimentalSpecifierResolution: 'node',
		files: true,
		transpileOnly: true,
		compilerOptions: {
			experimentalDecorators,
			module: 'ESNext',
			target: 'ES2022'
		}
	};

	const mergedOptions = { ...defaultOptions, ...options };
	logger.checkpoint('Creating ts-node service', {
		experimentalDecorators,
		transpiler: mergedOptions.transpiler,
		esm: mergedOptions.esm
	});

	let service;
	try {
		service = tsNode.create(mergedOptions);
		logger.checkpoint('ts-node service created successfully');
	} catch (error) {
		logger.error('Failed to create ts-node service', error, { options: mergedOptions });
		throw new Error(`Failed to create ts-node service: ${error.message}`, { cause: error });
	}

	serviceCache.set(cacheKey, service);
	return service;
}

export function createEsmHooks(transpiler) {
	logger.checkpoint('createEsmHooks called', { transpiler });

	try {
		const service = createTsNodeService({ transpiler });
		logger.checkpoint('Creating ESM hooks from service');

		const hooks = tsNode.createEsmHooks(service);
		logger.checkpoint('ESM hooks created successfully');

		return hooks;
	} catch (error) {
		logger.error('Failed to create ESM hooks', error, { transpiler });
		throw new Error(`Failed to create ESM hooks: ${error.message}`, { cause: error });
	}
}
