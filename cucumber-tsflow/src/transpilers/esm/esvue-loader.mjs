import { createEsbuildLoader } from './loader-utils.mjs';
import { createLogger } from '../../utils/tsflow-logger.mjs';

const logger = createLogger('esvue-loader');

logger.checkpoint('Initializing esvue-loader');

// Create and export the loader with Vue support
const loader = createEsbuildLoader({
	loaderName: 'esvue-loader',
	handleVue: true
});

logger.checkpoint('esvue-loader initialized');

export const { resolve, load, getFormat, transformSource } = loader;
