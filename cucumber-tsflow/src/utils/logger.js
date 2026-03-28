"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const console_logger_1 = require("@cucumber/cucumber/lib/environment/console_logger");
const debug_1 = __importDefault(require("debug"));
const debugEnabled = debug_1.default.enabled('cucumber');
const logger = new console_logger_1.ConsoleLogger(process.stderr, debugEnabled);
exports.default = logger;
//# sourceMappingURL=logger.js.map