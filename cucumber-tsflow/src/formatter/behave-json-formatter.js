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
const index_1 = require("@cucumber/cucumber/lib/formatter/helpers/index");
const messages = __importStar(require("@cucumber/messages"));
const value_checker_1 = require("@cucumber/cucumber/lib/value_checker");
const json_formatter_1 = __importDefault(require("@cucumber/cucumber/lib/formatter/json_formatter"));
const { getStepKeyword } = index_1.PickleParser;
class BehaveJsonFormatter extends json_formatter_1.default {
    static documentation = 'Prints the feature as JSON that can be used with Behave Pro';
    getStepData({ isBeforeHook, gherkinStepMap, pickleStepMap, testStep, testStepAttachments, testStepResult }) {
        const data = {};
        if ((0, value_checker_1.doesHaveValue)(testStep.pickleStepId)) {
            const pickleStep = pickleStepMap[testStep.pickleStepId];
            data.arguments = this.formatStepArgument(pickleStep.argument, gherkinStepMap[pickleStep.astNodeIds[0]]);
            data.keyword = getStepKeyword({ pickleStep, gherkinStepMap });
            data.line = gherkinStepMap[pickleStep.astNodeIds[0]].location.line;
            data.name = pickleStep.text;
        }
        else {
            data.keyword = isBeforeHook ? 'Before' : 'After';
            data.hidden = true;
            data.name = '';
        }
        if ((0, value_checker_1.doesHaveValue)(testStep.stepDefinitionIds) && testStep.stepDefinitionIds?.length === 1) {
            const stepDefinitionId = testStep.stepDefinitionIds[0];
            const stepDefinition = this.supportCodeLibrary.stepDefinitions.find(s => s.id === stepDefinitionId);
            data.match = { location: (0, index_1.formatLocation)(stepDefinition) };
        }
        const { message, status } = testStepResult;
        data.result = {
            status: messages.TestStepResultStatus[status].toLowerCase()
        };
        if ((0, value_checker_1.doesHaveValue)(testStepResult.duration)) {
            data.result.duration = messages.TimeConversion.durationToMilliseconds(testStepResult.duration) * 1000000;
        }
        if (status === messages.TestStepResultStatus.FAILED && (0, value_checker_1.doesHaveValue)(message)) {
            data.result.error_message = message;
        }
        if (testStepAttachments?.length > 0) {
            data.embeddings = testStepAttachments.map(attachment => ({
                data: attachment.body,
                mime_type: attachment.mediaType
            }));
        }
        return data;
    }
}
exports.default = BehaveJsonFormatter;
//# sourceMappingURL=behave-json-formatter.js.map