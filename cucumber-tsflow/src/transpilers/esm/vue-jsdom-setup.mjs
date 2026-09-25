// lib/transpilers/esm/vue-jsdom-setup.mjs
/* eslint-disable no-undef */

import { createRequire } from 'module';
import { createLogger, describeThrowable, isVerbose } from '../../utils/tsflow-logger.mjs';

const logger = createLogger('jsdom-setup');
const verbose = isVerbose();

logger.checkpoint('Initializing JSDOM environment');

const require = createRequire(import.meta.url);

try {
	logger.checkpoint('Loading jsdom-global');
	require('jsdom-global')();
	logger.checkpoint('jsdom-global loaded and executed');
} catch (error) {
	if (verbose) logger.checkpoint('Failed to initialize jsdom-global', { error: describeThrowable(error) });
	throw new Error(`Failed to initialize JSDOM: ${error.message}`, { cause: error });
}

// After jsdom-global, window and document should be global
if (typeof window !== 'undefined') {
	logger.checkpoint('Window is available, setting up Vue-specific globals');

	try {
		globalThis.SVGElement = window.SVGElement;
		globalThis.Element = window.Element;
		globalThis.HTMLElement = window.HTMLElement;
		globalThis.HTMLDivElement = window.HTMLDivElement;

		logger.checkpoint('Vue-specific globals set', {
			hasSVGElement: !!globalThis.SVGElement,
			hasElement: !!globalThis.Element,
			hasHTMLElement: !!globalThis.HTMLElement,
			hasHTMLDivElement: !!globalThis.HTMLDivElement
		});
	} catch (error) {
		if (verbose) logger.checkpoint('Failed to set Vue-specific globals', { error: describeThrowable(error) });
		throw new Error(`Failed to set Vue globals: ${error.message}`, { cause: error });
	}
} else {
	logger.warn('Window is not available after jsdom-global initialization');
}

logger.checkpoint('JSDOM environment setup complete');

export {}; // Make it a module
