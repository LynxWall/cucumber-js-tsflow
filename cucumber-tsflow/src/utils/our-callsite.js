"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.Callsite = void 0;
const sourceMapSupport = __importStar(require("source-map-support"));
/**
 * Represents a callsite of where a step binding is being applied.
 */
class Callsite {
    filename;
    lineNumber;
    static cwd = process.cwd();
    /**
     * Initializes a new [[Callsite]].
     *
     * @param filename The filename of the callsite.
     * @param lineNumber The line number of the callsite.
     */
    constructor(filename, lineNumber) {
        this.filename = filename;
        this.lineNumber = lineNumber;
    }
    /**
     * Returns a string representation of the callsite.
     *
     * @returns A string representing the callsite formatted with the filename and line
     * number.
     */
    toString() {
        return `${this.filename}:${this.lineNumber}`;
    }
    static callsites() {
        const _prepareStackTrace = Error.prepareStackTrace;
        Error.prepareStackTrace = (_, stack) => stack;
        const stack = new Error().stack?.slice(1) ?? ['', '', 'unknown'];
        Error.prepareStackTrace = _prepareStackTrace;
        return stack;
    }
    /**
     * Captures the current [[Callsite]] object.
     */
    static capture() {
        const stack = Callsite.callsites()[2];
        const tsStack = sourceMapSupport.wrapCallSite(stack);
        const ourCallsite = new Callsite(tsStack.getFileName() || '', tsStack.getLineNumber() || -1);
        ourCallsite.filename = ourCallsite.filename.replace(`${this.cwd}\\`, '');
        return ourCallsite;
    }
}
exports.Callsite = Callsite;
//# sourceMappingURL=our-callsite.js.map