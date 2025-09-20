// lib/transpilers/esm/vue-jsdom-setup.mjs
/* eslint-disable no-undef */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

require('jsdom-global')();

// After jsdom-global, window and document should be global
// Add Vue-specific constructors to global scope
if (typeof window !== 'undefined') {
	// Use globalThis for cleaner code
	globalThis.SVGElement = window.SVGElement;
	globalThis.Element = window.Element;
	globalThis.HTMLElement = window.HTMLElement;
	globalThis.HTMLDivElement = window.HTMLDivElement;
}

export {}; // Make it a module
