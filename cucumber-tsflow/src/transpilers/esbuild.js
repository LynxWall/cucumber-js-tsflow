"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.transpileCode = exports.supports = exports.loaders = void 0;
const esbuild_1 = require("esbuild");
const path_1 = __importDefault(require("path"));
const defaultOptions = {
    debug: true
};
const commonOptions = {
    format: 'cjs',
    logLevel: 'info',
    target: [`es2022`],
    minify: false,
    sourcemap: 'external'
};
if (global.experimentalDecorators) {
    commonOptions.tsconfigRaw = {
        compilerOptions: {
            experimentalDecorators: true,
            importsNotUsedAsValues: 'remove',
            strict: true
        }
    };
}
else {
    commonOptions.tsconfigRaw = {
        compilerOptions: {
            importsNotUsedAsValues: 'remove',
            strict: true
        }
    };
}
exports.loaders = {
    '.js': 'js',
    '.mjs': 'js',
    '.cjs': 'js',
    '.jsx': 'jsx',
    '.ts': 'ts',
    '.tsx': 'tsx',
    '.json': 'json'
};
const supports = (filename) => {
    if (filename.includes('node_modules') || filename.includes('cucumber-tsflow/lib'))
        return false;
    return path_1.default.extname(filename) in exports.loaders;
};
exports.supports = supports;
const getLoaders = (options) => {
    const ret = { ...exports.loaders };
    if (typeof options.esbuild?.loader == 'object') {
        for (const [e, l] of Object.entries(options.esbuild.loader))
            ret[e] = l;
    }
    return ret;
};
const transpileCode = (code, filename, ext, _options) => {
    const options = { ...defaultOptions, ..._options };
    const loaders = getLoaders(options);
    const loaderExt = ext != undefined ? ext : path_1.default.extname(filename);
    const ret = (0, esbuild_1.transformSync)(code, {
        ...commonOptions,
        ...options.esbuild,
        loader: loaders[loaderExt],
        sourcefile: filename
    });
    return { output: ret.code, sourceMap: ret.map };
};
exports.transpileCode = transpileCode;
//# sourceMappingURL=esbuild.js.map