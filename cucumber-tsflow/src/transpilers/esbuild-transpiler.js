"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EsbuildTranspiler = void 0;
const esbuild_1 = require("./esbuild");
const create = (_createOptions) => {
    return new EsbuildTranspiler();
};
class EsbuildTranspiler {
    transpile = (input, options) => {
        const result = (0, esbuild_1.transpileCode)(input, options.fileName);
        return {
            outputText: result.output,
            sourceMapText: result.sourceMap
        };
    };
}
exports.EsbuildTranspiler = EsbuildTranspiler;
exports.create = create;
//# sourceMappingURL=esbuild-transpiler.js.map