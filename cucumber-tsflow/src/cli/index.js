"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const run_cucumber_1 = require("../api/run-cucumber");
const load_configuration_1 = require("../api/load-configuration");
const i18n_1 = require("@cucumber/cucumber/lib/cli/i18n");
const install_validator_1 = require("@cucumber/cucumber/lib/cli/install_validator");
const argv_parser_1 = __importDefault(require("./argv-parser"));
const debug_1 = __importDefault(require("debug"));
const tsflow_logger_1 = require("../utils/tsflow-logger");
const logger = (0, tsflow_logger_1.createLogger)('cli');
class Cli {
    argv;
    cwd;
    stdout;
    stderr;
    env;
    constructor({ argv, cwd, stdout, stderr = process.stderr, env }) {
        logger.checkpoint('Cli constructor', { cwd, argvLength: argv.length });
        this.argv = argv;
        this.cwd = cwd;
        this.stdout = stdout;
        this.stderr = stderr;
        this.env = env;
    }
    async run() {
        logger.checkpoint('Cli.run() started');
        const debugEnabled = debug_1.default.enabled('cucumber');
        logger.checkpoint('Debug status', { debugEnabled });
        if (debugEnabled) {
            logger.checkpoint('Validating install');
            await (0, install_validator_1.validateInstall)();
            logger.checkpoint('Install validated');
        }
        // Parse argv
        let options;
        let argvConfiguration;
        try {
            logger.checkpoint('Parsing argv', { argv: this.argv });
            const parsed = argv_parser_1.default.parse(this.argv);
            options = parsed.options;
            argvConfiguration = parsed.configuration;
            logger.checkpoint('Argv parsed', { options });
        }
        catch (error) {
            logger.error('Argv parsing failed', error, { argv: this.argv });
            throw new Error(`Failed to parse command line arguments: ${error.message}`, { cause: error });
        }
        if (options.i18nLanguages) {
            this.stdout.write((0, i18n_1.getLanguages)());
            return {
                shouldExitImmediately: true,
                success: true
            };
        }
        if (options.i18nKeywords) {
            this.stdout.write((0, i18n_1.getKeywords)(options.i18nKeywords));
            return {
                shouldExitImmediately: true,
                success: true
            };
        }
        const environment = {
            cwd: this.cwd,
            stdout: this.stdout,
            stderr: this.stderr,
            env: this.env,
            debug: debugEnabled
        };
        logger.checkpoint('Environment constructed', { cwd: this.cwd, debug: debugEnabled });
        // Load configuration
        let configuration;
        let runConfiguration;
        try {
            logger.checkpoint('Loading configuration', {
                configFile: options.config,
                profiles: options.profile
            });
            const loaded = await (0, load_configuration_1.loadConfiguration)({
                file: options.config,
                profiles: options.profile,
                provided: argvConfiguration
            }, environment);
            configuration = loaded.useConfiguration;
            runConfiguration = loaded.runConfiguration;
            logger.checkpoint('Configuration loaded', {
                transpiler: configuration.transpiler,
                loaders: runConfiguration.support?.loaders,
                parallel: runConfiguration.runtime?.parallel
            });
        }
        catch (error) {
            logger.error('Configuration loading failed', error);
            throw new Error(`Failed to load configuration: ${error.message}`, { cause: error });
        }
        // Run cucumber
        try {
            logger.checkpoint('Running cucumber');
            const { success } = await (0, run_cucumber_1.runCucumber)(runConfiguration, environment);
            logger.checkpoint('Cucumber completed', { success });
            return {
                shouldExitImmediately: configuration.forceExit,
                success
            };
        }
        catch (error) {
            logger.error('Cucumber execution failed', error);
            throw new Error(`Failed during cucumber execution: ${error.message}`, { cause: error });
        }
    }
}
exports.default = Cli;
//# sourceMappingURL=index.js.map