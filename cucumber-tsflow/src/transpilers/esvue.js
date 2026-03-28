"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const hooks = require('require-extension-hooks');
const vue_sfc_compiler_1 = require("./vue-sfc-compiler");
require('ts-node-maintained').register({
    transpileOnly: true,
    transpiler: '@lynxwall/cucumber-tsflow/lib/transpilers/esbuild-transpiler'
});
require('tsconfig-paths').register();
// Register jsdom globally and set SVGElement on global
require('jsdom-global')();
global.SVGElement = global.window.SVGElement;
hooks('vue').push(function (params) {
    try {
        const result = (0, vue_sfc_compiler_1.compileVueSFC)(params.content, params.filename, {
            enableStyle: !!global.enableVueStyle,
            format: 'cjs'
        });
        return result.code;
    }
    catch (err) {
        console.error(err);
    }
    return params.content;
});
//# sourceMappingURL=esvue.js.map