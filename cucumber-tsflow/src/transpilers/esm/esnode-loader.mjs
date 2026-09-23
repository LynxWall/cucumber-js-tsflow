import { createEsbuildLoader } from './loader-utils.mjs';
import { initialize, relaySourceMaps } from './source-map-relay.mjs';
import { createLogger } from '../../utils/tsflow-logger.mjs';

const logger = createLogger('esnode-loader');

logger.checkpoint('Initializing esnode-loader');

// Create and export the loader with default options
const loader = relaySourceMaps(
	createEsbuildLoader({
		loaderName: 'esnode-loader',
		handleVue: false
	})
);

logger.checkpoint('esnode-loader initialized');

// Synchronous hooks. Attached in-thread with module.registerHooks() on Node >= 22.15 / 23.5, or on the
// loader hooks thread with module.register() otherwise (see src/api/register-loaders.ts).
export const { resolve, load } = loader;

// Under module.register(): receives the source-map relay port and the TSFLOW_TIMING port passed as `data`
export { initialize };
