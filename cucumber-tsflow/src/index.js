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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Cli = exports.wrapPromiseWithTimeout = exports.Status = exports.parallelCanAssignHelpers = exports.context = exports.world = exports.World = exports.setParallelCanAssign = exports.setWorldConstructor = exports.setDefinitionFunctionWrapper = exports.setDefaultTimeout = exports.defineParameterType = exports.ScenarioInfo = exports.then = exports.when = exports.given = exports.afterStep = exports.after = exports.afterAll = exports.beforeStep = exports.before = exports.beforeAll = exports.binding = exports.formatterHelpers = exports.UsageJsonFormatter = exports.UsageFormatter = exports.SummaryFormatter = exports.SnippetsFormatter = exports.RerunFormatter = exports.ProgressFormatter = exports.JsonFormatter = exports.FormatterBuilder = exports.Formatter = exports.JunitBambooFormatter = exports.BehaveFormatter = exports.TsflowSnippet = exports.TestCaseHookDefinition = exports.DataTable = exports.supportCodeLibraryBuilder = exports.version = void 0;
/**
 * User code functions and helpers
 *
 * @packageDocumentation
 * @module (root)
 * @remarks
 * These docs cover the functions and helpers for user code registration and test setup. The entry point is `@lynxwall/cucumber-tsflow`.
 */
const node_util_1 = require("node:util");
const messages = __importStar(require("@cucumber/messages"));
const cli_1 = __importDefault(require("./cli"));
const formatterHelpers = __importStar(require("@cucumber/cucumber/lib/formatter/helpers/index"));
exports.formatterHelpers = formatterHelpers;
const parallelCanAssignHelpers = __importStar(require("@cucumber/cucumber/lib/support_code_library_builder/parallel_can_assign_helpers"));
exports.parallelCanAssignHelpers = parallelCanAssignHelpers;
const index_1 = __importDefault(require("@cucumber/cucumber/lib/support_code_library_builder/index"));
const version_1 = require("./version");
// type version as string
exports.version = version_1.version;
// Top level
var index_2 = require("@cucumber/cucumber/lib/support_code_library_builder/index");
Object.defineProperty(exports, "supportCodeLibraryBuilder", { enumerable: true, get: function () { return __importDefault(index_2).default; } });
var data_table_1 = require("@cucumber/cucumber/lib/models/data_table");
Object.defineProperty(exports, "DataTable", { enumerable: true, get: function () { return __importDefault(data_table_1).default; } });
var test_case_hook_definition_1 = require("@cucumber/cucumber/lib/models/test_case_hook_definition");
Object.defineProperty(exports, "TestCaseHookDefinition", { enumerable: true, get: function () { return __importDefault(test_case_hook_definition_1).default; } });
// TsFlow Snippet Syntax and Formatters
var tsflow_snippet_syntax_1 = require("./formatter/step-definition-snippit-syntax/tsflow-snippet-syntax");
Object.defineProperty(exports, "TsflowSnippet", { enumerable: true, get: function () { return __importDefault(tsflow_snippet_syntax_1).default; } });
var behave_json_formatter_1 = require("./formatter/behave-json-formatter");
Object.defineProperty(exports, "BehaveFormatter", { enumerable: true, get: function () { return __importDefault(behave_json_formatter_1).default; } });
var junit_bamboo_formatter_1 = require("./formatter/junit-bamboo-formatter");
Object.defineProperty(exports, "JunitBambooFormatter", { enumerable: true, get: function () { return __importDefault(junit_bamboo_formatter_1).default; } });
// CucumberJS Formatters
var index_3 = require("@cucumber/cucumber/lib/formatter/index");
Object.defineProperty(exports, "Formatter", { enumerable: true, get: function () { return __importDefault(index_3).default; } });
var builder_1 = require("@cucumber/cucumber/lib/formatter/builder");
Object.defineProperty(exports, "FormatterBuilder", { enumerable: true, get: function () { return __importDefault(builder_1).default; } });
var json_formatter_1 = require("@cucumber/cucumber/lib/formatter/json_formatter");
Object.defineProperty(exports, "JsonFormatter", { enumerable: true, get: function () { return __importDefault(json_formatter_1).default; } });
var progress_formatter_1 = require("@cucumber/cucumber/lib/formatter/progress_formatter");
Object.defineProperty(exports, "ProgressFormatter", { enumerable: true, get: function () { return __importDefault(progress_formatter_1).default; } });
var rerun_formatter_1 = require("@cucumber/cucumber/lib/formatter/rerun_formatter");
Object.defineProperty(exports, "RerunFormatter", { enumerable: true, get: function () { return __importDefault(rerun_formatter_1).default; } });
var snippets_formatter_1 = require("@cucumber/cucumber/lib/formatter/snippets_formatter");
Object.defineProperty(exports, "SnippetsFormatter", { enumerable: true, get: function () { return __importDefault(snippets_formatter_1).default; } });
var summary_formatter_1 = require("@cucumber/cucumber/lib/formatter/summary_formatter");
Object.defineProperty(exports, "SummaryFormatter", { enumerable: true, get: function () { return __importDefault(summary_formatter_1).default; } });
var usage_formatter_1 = require("@cucumber/cucumber/lib/formatter/usage_formatter");
Object.defineProperty(exports, "UsageFormatter", { enumerable: true, get: function () { return __importDefault(usage_formatter_1).default; } });
var usage_json_formatter_1 = require("@cucumber/cucumber/lib/formatter/usage_json_formatter");
Object.defineProperty(exports, "UsageJsonFormatter", { enumerable: true, get: function () { return __importDefault(usage_json_formatter_1).default; } });
// Tsflow Support Code Functions - replaces CucumberJS hook and step functions
var binding_decorator_1 = require("./bindings/binding-decorator");
Object.defineProperty(exports, "binding", { enumerable: true, get: function () { return binding_decorator_1.binding; } });
var hook_decorators_1 = require("./bindings/hook-decorators");
Object.defineProperty(exports, "beforeAll", { enumerable: true, get: function () { return hook_decorators_1.beforeAll; } });
Object.defineProperty(exports, "before", { enumerable: true, get: function () { return hook_decorators_1.before; } });
Object.defineProperty(exports, "beforeStep", { enumerable: true, get: function () { return hook_decorators_1.beforeStep; } });
Object.defineProperty(exports, "afterAll", { enumerable: true, get: function () { return hook_decorators_1.afterAll; } });
Object.defineProperty(exports, "after", { enumerable: true, get: function () { return hook_decorators_1.after; } });
Object.defineProperty(exports, "afterStep", { enumerable: true, get: function () { return hook_decorators_1.afterStep; } });
var step_decorators_1 = require("./bindings/step-decorators");
Object.defineProperty(exports, "given", { enumerable: true, get: function () { return step_decorators_1.given; } });
Object.defineProperty(exports, "when", { enumerable: true, get: function () { return step_decorators_1.when; } });
Object.defineProperty(exports, "then", { enumerable: true, get: function () { return step_decorators_1.then; } });
var scenario_context_1 = require("./runtime/scenario-context");
Object.defineProperty(exports, "ScenarioInfo", { enumerable: true, get: function () { return scenario_context_1.ScenarioInfo; } });
// Support Code Functions
const { methods } = index_1.default;
exports.defineParameterType = methods.defineParameterType;
exports.setDefaultTimeout = methods.setDefaultTimeout;
exports.setDefinitionFunctionWrapper = methods.setDefinitionFunctionWrapper;
exports.setWorldConstructor = methods.setWorldConstructor;
exports.setParallelCanAssign = methods.setParallelCanAssign;
var world_1 = require("@cucumber/cucumber/lib/support_code_library_builder/world");
Object.defineProperty(exports, "World", { enumerable: true, get: function () { return __importDefault(world_1).default; } });
var index_4 = require("@cucumber/cucumber/lib/runtime/scope/index");
Object.defineProperty(exports, "world", { enumerable: true, get: function () { return index_4.worldProxy; } });
Object.defineProperty(exports, "context", { enumerable: true, get: function () { return index_4.contextProxy; } });
exports.Status = messages.TestStepResultStatus;
// Time helpers
var time_1 = require("@cucumber/cucumber/lib/time");
Object.defineProperty(exports, "wrapPromiseWithTimeout", { enumerable: true, get: function () { return time_1.wrapPromiseWithTimeout; } });
// Deprecated
/**
 * @deprecated use `runCucumber` instead; see https://github.com/cucumber/cucumber-js/blob/main/docs/deprecations.md
 */
exports.Cli = (0, node_util_1.deprecate)(cli_1.default, '`Cli` is deprecated, use `runCucumber` instead; see https://github.com/cucumber/cucumber-js/blob/main/docs/deprecations.md');
//# sourceMappingURL=index.js.map