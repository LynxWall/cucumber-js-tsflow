import { createRequire } from 'module';
const require = createRequire(import.meta.url);
require('jsdom-global')();
global.SVGElement = global.window.SVGElement;
