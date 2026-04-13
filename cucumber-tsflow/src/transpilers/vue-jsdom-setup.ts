/**
 * vue-jsdom-setup.ts
 *
 * CJS counterpart of esm/vue-jsdom-setup.mjs.
 * Registers jsdom-global and sets DOM-related globals needed by Vue test
 * libraries (e.g. @vue/test-utils). Used by the --prebuild path so that
 * the full Vue transpiler modules (which also register ts-node / esbuild
 * hooks) are not loaded when the code is already compiled JS.
 */
import { createLogger } from '../utils/tsflow-logger';

const logger = createLogger('jsdom-setup');

logger.checkpoint('Initializing JSDOM environment');

try {
	logger.checkpoint('Loading jsdom-global');
	require('jsdom-global')();
	logger.checkpoint('jsdom-global loaded and executed');
} catch (error: any) {
	logger.error('Failed to initialize jsdom-global', error);
	throw new Error(`Failed to initialize JSDOM: ${error.message}`, { cause: error });
}

// After jsdom-global, window and document should be global
if (typeof window !== 'undefined') {
	logger.checkpoint('Window is available, setting up Vue-specific globals');

	try {
		(globalThis as any).SVGElement = window.SVGElement;
		(globalThis as any).Element = window.Element;
		(globalThis as any).HTMLElement = window.HTMLElement;
		(globalThis as any).HTMLDivElement = window.HTMLDivElement;

		logger.checkpoint('Vue-specific globals set', {
			hasSVGElement: !!(globalThis as any).SVGElement,
			hasElement: !!(globalThis as any).Element,
			hasHTMLElement: !!(globalThis as any).HTMLElement,
			hasHTMLDivElement: !!(globalThis as any).HTMLDivElement
		});
	} catch (error: any) {
		logger.error('Failed to set Vue-specific globals', error);
		throw new Error(`Failed to set Vue globals: ${error.message}`, { cause: error });
	}
} else {
	logger.warn('Window is not available after jsdom-global initialization');
}

logger.checkpoint('JSDOM environment setup complete');
