"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = run;
const index_1 = __importDefault(require("./index"));
const validate_node_engine_version_1 = require("@cucumber/cucumber/lib/cli/validate_node_engine_version");
const tsflow_logger_1 = require("../utils/tsflow-logger");
const logger = (0, tsflow_logger_1.createLogger)('run');
async function run() {
    logger.checkpoint('Starting cucumber-tsflow', {
        nodeVersion: process.version,
        cwd: process.cwd()
    });
    (0, validate_node_engine_version_1.validateNodeEngineVersion)(process.version, (error) => {
        logger.error('Node version validation failed', error);
        process.exit(1);
    }, console.warn);
    logger.checkpoint('Node version validated');
    let cli;
    try {
        logger.checkpoint('Constructing CLI');
        cli = new index_1.default({
            argv: process.argv,
            cwd: process.cwd(),
            stdout: process.stdout,
            stderr: process.stderr,
            env: process.env
        });
        logger.checkpoint('CLI constructed');
    }
    catch (error) {
        logger.error('Failed during CLI initialization', error);
        process.exit(1);
    }
    let result;
    try {
        logger.checkpoint('Running CLI');
        result = await cli.run();
        logger.checkpoint('CLI run completed', { success: result.success });
    }
    catch (error) {
        logger.error('Failed during CLI execution', error);
        process.exit(1);
    }
    // 0 = success, 2 = failed or has pending, undefined or unknown steps
    let exitCode = result.success ? 0 : 2;
    if (!result.success && global.messageCollector.hasFailures()) {
        // 3 = implemented tests have failed
        exitCode = 3;
    }
    logger.checkpoint('Exiting', { exitCode });
    if (result.shouldExitImmediately) {
        process.exit(exitCode);
    }
    else {
        process.exitCode = exitCode;
    }
}
//# sourceMappingURL=run.js.map