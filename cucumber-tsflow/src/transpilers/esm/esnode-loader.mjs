import { createEsbuildLoader } from './loader-utils.mjs';
import { createLogger } from '../../utils/tsflow-logger.mjs';

const logger = createLogger('esnode-loader');

logger.checkpoint('Initializing esnode-loader');

// Create and export the loader with default options
const loader = createEsbuildLoader({
	loaderName: 'esnode-loader',
	handleVue: false
});

logger.checkpoint('esnode-loader initialized');

export const { resolve, load, getFormat, transformSource } = loader;

// TSFLOW_TIMING support: receives the timing MessagePort passed via module.register() data
export { initialize } from '../../utils/tsflow-timing.mjs';
