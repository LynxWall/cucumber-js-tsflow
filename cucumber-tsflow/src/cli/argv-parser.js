"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const lodash_merge_1 = __importDefault(require("lodash.merge"));
const path_1 = __importDefault(require("path"));
const gherkin_1 = require("@cucumber/gherkin");
const index_1 = require("@cucumber/cucumber/lib/formatter/builtin/index");
const version_1 = require("../version");
const ArgvParser = {
    collect(val, memo = []) {
        if (val) {
            return [...memo, val];
        }
        return undefined;
    },
    mergeJson(option) {
        return function (str, memo = {}) {
            let val;
            try {
                val = JSON.parse(str);
            }
            catch (error) {
                const e = error;
                throw new Error(`${option} passed invalid JSON: ${e.message}: ${str}`);
            }
            if (typeof val !== 'object' || Array.isArray(val)) {
                throw new Error(`${option} must be passed JSON of an object: ${str}`);
            }
            return (0, lodash_merge_1.default)(memo, val);
        };
    },
    mergeTags(value, memo) {
        return memo ? `${memo} and (${value})` : `(${value})`;
    },
    validateCountOption(value, optionName) {
        const numericValue = parseInt(value);
        if (isNaN(numericValue) || numericValue < 0) {
            throw new Error(`${optionName} must be a non negative integer`);
        }
        return numericValue;
    },
    validateLanguage(value) {
        if (!Object.keys(gherkin_1.dialects).includes(value)) {
            throw new Error(`Unsupported ISO 639-1: ${value}`);
        }
        return value;
    },
    parse(argv) {
        const program = new commander_1.Command(path_1.default.basename(argv[1]));
        program
            .storeOptionsAsProperties(false)
            .usage('[options] [<GLOB|DIR|FILE[:LINE]>...]')
            .version(version_1.version, '-v, --version')
            .option('-b, --backtrace', 'show full backtrace for errors')
            .option('-c, --config <PATH>', 'specify configuration file')
            .option('-d, --dry-run', 'invoke formatters without executing steps')
            .option('--debug-file <STRING>', 'path to a file with steps for debugging')
            .option('--enable-vue-style', 'Enable Vue Style block when compiling Vue SFC. Defaults to false.')
            .option('--exit, --force-exit', 'force shutdown of the event loop when the test run has finished: cucumber will call process.exit')
            .option('--experimental-decorators', 'Enable TypeScript Experimental Decorators when transpiling. Defaults to false.')
            .option('--fail-fast', 'abort the run on first failure')
            .option('-f, --format <TYPE[:PATH]>', 'specify the output format, optionally supply PATH to redirect formatter output (repeatable).  Available formats:\n' +
            Object.entries(index_1.documentation).reduce((previous, [key, description]) => previous + `    ${key}: ${description}\n`, ''), ArgvParser.collect)
            .option('--format-options <JSON>', 'provide options for formatters (repeatable)', ArgvParser.mergeJson('--format-options'))
            .option('--i18n-keywords <ISO 639-1>', 'list language keywords', ArgvParser.validateLanguage)
            .option('--i18n-languages', 'list languages')
            .option('-i, --import <GLOB|DIR|FILE>', 'import files before executing features (repeatable)', ArgvParser.collect)
            .option('--language <ISO 639-1>', 'provide the default language for feature files')
            .option('--name <REGEXP>', 'only execute the scenarios with name matching the expression (repeatable)', ArgvParser.collect)
            .option('--order <TYPE[:SEED]>', 'run scenarios in the specified order. Type should be `defined` or `random`')
            .option('-p, --profile <NAME>', 'specify the profile to use (repeatable)', ArgvParser.collect, [])
            .option('--parallel <NUMBER_OF_WORKERS>', 'run in parallel with the given number of workers', val => ArgvParser.validateCountOption(val, '--parallel'))
            .option('--publish', 'Publish a report to https://reports.cucumber.io')
            .option('-r, --require <GLOB|DIR|FILE>', 'require files before executing features (repeatable)', ArgvParser.collect)
            .option('--require-module <NODE_MODULE>', 'require node modules before requiring files (repeatable)', ArgvParser.collect)
            .option('--retry <NUMBER_OF_RETRIES>', 'specify the number of times to retry failing test cases (default: 0)', val => ArgvParser.validateCountOption(val, '--retry'))
            .option('--retry-tag-filter <EXPRESSION>', `only retries the features or scenarios with tags matching the expression (repeatable).
        This option requires '--retry' to be specified.`, ArgvParser.mergeTags)
            .option('--strict', 'fail if there are pending steps')
            .option('--no-strict', 'succeed even if there are pending steps')
            .option('-t, --tags <EXPRESSION>', 'only execute the features or scenarios with tags matching the expression (repeatable)', ArgvParser.mergeTags)
            .option('--parallel-load [THREADS]', 'Pre-warm transpiler caches in parallel worker threads before loading support code. ' +
            'Pass a number to control thread count, or omit for auto-detect.', val => {
            if (val === undefined || val === '')
                return true;
            return ArgvParser.validateCountOption(val, '--parallel-load');
        })
            .option('--transpiler <ES-NODE|TS-NODE|ES-VUE|TS-VUE|TS-VUE-ESM|ES-NODE-ESM|ES-VUE-ESM>', `built-in transpiler to use. ESxxx transpilers use esbuild and TSxxx transpilers use typescript.\n
				Vue versions of the transpilers add a hook for .vue transforms and initialize jsdom globally.\n
				Default: ESNODE (esbuild without Vue support)`)
            .option('--world-parameters <JSON>', 'provide parameters that will be passed to the world constructor (repeatable)', ArgvParser.mergeJson('--world-parameters'));
        program.addHelpText('afterAll', 'For more details please visit https://github.com/cucumber/cucumber-js/blob/main/docs/cli.md');
        program.parse(argv);
        const { config, i18nKeywords, i18nLanguages, profile, ...regularStuff } = program.opts();
        const configuration = regularStuff;
        if (program.args.length > 0) {
            configuration.paths = program.args;
        }
        return {
            options: {
                config,
                i18nKeywords,
                i18nLanguages,
                profile
            },
            configuration
        };
    }
};
exports.default = ArgvParser;
//# sourceMappingURL=argv-parser.js.map