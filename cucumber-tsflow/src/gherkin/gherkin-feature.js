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
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const glob_1 = require("glob");
const messages = __importStar(require("@cucumber/messages"));
const configuration_1 = require("./configuration");
const src_1 = require("@cucumber/gherkin/dist/src");
class GherkinFeature {
    cwd = process.cwd();
    loadFeature = async (featureFilePath, addCwd, options) => {
        try {
            if (addCwd) {
                featureFilePath = path.join(this.cwd, featureFilePath);
            }
            const featureText = await fs.promises.readFile(featureFilePath, { encoding: 'utf8' });
            return this.parseFeature(featureText, featureFilePath, options);
        }
        catch (err) {
            if (err.code === 'ENOENT') {
                throw new Error(`Feature file not found (${featureFilePath})`);
            }
            else {
                throw err;
            }
        }
    };
    loadFeatures = async (globPattern, options) => {
        const featureFiles = await (0, glob_1.glob)(globPattern, { cwd: this.cwd });
        return await Promise.all(featureFiles.map(featureFilePath => this.loadFeature(featureFilePath, true, options)));
    };
    parseFeature = (featureText, featureFilePath, options) => {
        let ast;
        options = (0, configuration_1.getJestCucumberConfiguration)(options);
        try {
            const builder = new src_1.AstBuilder(messages.IdGenerator.uuid());
            const matcher = new src_1.GherkinClassicTokenMatcher(); // or Gherkin.GherkinInMarkdownTokenMatcher()
            ast = new src_1.Parser(builder, matcher).parse(featureText);
        }
        catch (err) {
            throw new Error(`Error parsing feature Gherkin: ${err.message}`);
        }
        let astFeature = this.collapseRulesAndBackgrounds(ast.feature);
        if (astFeature.language !== 'en') {
            astFeature = this.translateKeywords(astFeature);
        }
        return {
            title: astFeature.name,
            featureFile: featureFilePath,
            scenarios: this.parseScenarios(astFeature),
            scenarioOutlines: this.parseScenarioOutlines(astFeature),
            tags: this.parseTags(astFeature),
            options
        };
    };
    parseDataTableRow = (astDataTableRow) => {
        return astDataTableRow.cells.map((col) => col.value);
    };
    parseDataTable = (astDataTable, astDataTableHeader) => {
        let headerRow;
        let bodyRows;
        if (astDataTableHeader) {
            headerRow = this.parseDataTableRow(astDataTableHeader);
            bodyRows = astDataTable;
        }
        else {
            headerRow = this.parseDataTableRow(astDataTable.rows[0]);
            bodyRows = astDataTable && astDataTable.rows && astDataTable.rows.length && astDataTable.rows.slice(1);
        }
        if (bodyRows && bodyRows.length > 0) {
            return bodyRows.map(nextRow => {
                const parsedRow = this.parseDataTableRow(nextRow);
                return parsedRow.reduce((rowObj, nextCol, index) => {
                    return {
                        ...rowObj,
                        [headerRow[index]]: nextCol
                    };
                }, {});
            });
        }
        else {
            return [];
        }
    };
    parseStepArgument = (astStep) => {
        if (astStep) {
            switch (astStep.argument) {
                case 'dataTable':
                    return this.parseDataTable(astStep.dataTable);
                case 'docString':
                    return astStep.docString.content;
                default:
                    return null;
            }
        }
        else {
            return null;
        }
    };
    parseStep = (astStep) => {
        return {
            stepText: astStep.text,
            keyword: astStep.keyword.trim().toLowerCase(),
            stepArgument: this.parseStepArgument(astStep),
            lineNumber: astStep.location.line
        };
    };
    parseSteps = (astScenario) => {
        return astScenario.steps.map((astStep) => this.parseStep(astStep));
    };
    parseTags = (ast) => {
        if (!ast.tags) {
            return [];
        }
        else {
            return ast.tags.map((tag) => tag.name);
        }
    };
    parseScenario = (astScenario, astFeature) => {
        return {
            title: astScenario.name,
            steps: this.parseSteps(astScenario),
            tags: [...this.parseTags(astFeature), ...this.parseTags(astScenario)],
            lineNumber: astScenario.location.line,
            scenarioContext: undefined
        };
    };
    parseScenarioOutlineExampleSteps = (exampleTableRow, scenarioSteps) => {
        return scenarioSteps.map(scenarioStep => {
            const stepText = Object.keys(exampleTableRow).reduce((processedStepText, nextTableColumn) => {
                return processedStepText.replace(new RegExp(`<${nextTableColumn}>`, 'g'), exampleTableRow[nextTableColumn]);
            }, scenarioStep.stepText);
            let stepArgument = '';
            if (scenarioStep.stepArgument) {
                if (Array.isArray(scenarioStep.stepArgument)) {
                    stepArgument = scenarioStep.stepArgument.map((stepArgumentRow) => {
                        const modifiedStepArgumentRow = { ...stepArgumentRow };
                        const exampleKeys = Object.keys(exampleTableRow);
                        const modifiedKeys = Object.keys(modifiedStepArgumentRow);
                        if (exampleKeys.length > 0 && modifiedKeys.length > 0) {
                            const exampleLen = exampleKeys.length;
                            const modifiedLen = modifiedKeys.length;
                            for (let exampleIdx = 0; exampleIdx < exampleLen; exampleIdx++) {
                                const nextTableColumn = exampleKeys[exampleIdx];
                                for (let modifiedIdx = 0; modifiedIdx < modifiedLen; modifiedIdx++) {
                                    const prop = modifiedKeys[modifiedIdx];
                                    modifiedStepArgumentRow[prop] = modifiedStepArgumentRow[prop].replace(new RegExp(`<${nextTableColumn}>`, 'g'), exampleTableRow[nextTableColumn]);
                                }
                            }
                        }
                        return modifiedStepArgumentRow;
                    });
                }
                else {
                    stepArgument = scenarioStep.stepArgument;
                    if (typeof scenarioStep.stepArgument === 'string' || scenarioStep.stepArgument instanceof String) {
                        const exampleKeys = Object.keys(exampleTableRow);
                        const exampleLen = exampleKeys.length;
                        if (exampleKeys.length > 0) {
                            for (let exampleIdx = 0; exampleIdx < exampleLen; exampleIdx++) {
                                const nextTableColumn = exampleKeys[exampleIdx];
                                stepArgument = stepArgument.replace(new RegExp(`<${nextTableColumn}>`, 'g'), exampleTableRow[nextTableColumn]);
                            }
                        }
                    }
                }
            }
            return {
                ...scenarioStep,
                stepText,
                stepArgument
            };
        });
    };
    getOutlineDynamicTitle = (exampleTableRow, title) => {
        return title.replace(/<(\S*)>/g, (_, firstMatch) => {
            return exampleTableRow[firstMatch || ''];
        });
    };
    parseScenarioOutlineExample = (exampleTableRow, outlineScenario, exampleSetTags) => {
        return {
            title: this.getOutlineDynamicTitle(exampleTableRow, outlineScenario.title),
            steps: this.parseScenarioOutlineExampleSteps(exampleTableRow, outlineScenario.steps),
            tags: Array.from(new Set([...outlineScenario.tags, ...exampleSetTags])),
            exampleRow: exampleTableRow
        };
    };
    parseScenarioOutlineExampleSet = (astExampleSet, outlineScenario) => {
        const exampleTable = this.parseDataTable(astExampleSet.tableBody, astExampleSet.tableHeader);
        return exampleTable.map(tableRow => this.parseScenarioOutlineExample(tableRow, outlineScenario, this.parseTags(astExampleSet)));
    };
    parseScenarioOutlineExampleSets = (astExampleSets, outlineScenario) => {
        const exampleSets = astExampleSets.map((astExampleSet) => {
            return this.parseScenarioOutlineExampleSet(astExampleSet, outlineScenario);
        });
        return exampleSets.reduce((scenarios, nextExampleSet) => {
            return [...scenarios, ...nextExampleSet];
        }, []);
    };
    parseScenarioOutline = (astScenarioOutline, astFeature) => {
        const outlineScenario = this.parseScenario(astScenarioOutline.scenario, astFeature);
        return {
            title: outlineScenario.title,
            tags: outlineScenario.tags,
            exampleScenarios: this.parseScenarioOutlineExampleSets(astScenarioOutline.scenario.examples, outlineScenario),
            steps: outlineScenario.steps,
            lineNumber: astScenarioOutline.scenario.location.line,
            scenarioContext: undefined
        };
    };
    parseScenarios = (astFeature) => {
        return astFeature.children
            .filter((child) => {
            const keywords = ['Scenario Outline', 'Scenario Template'];
            return child.scenario && keywords.indexOf(child.scenario.keyword) === -1;
        })
            .map((astScenario) => this.parseScenario(astScenario.scenario, astFeature));
    };
    parseScenarioOutlines = (astFeature) => {
        return astFeature.children
            .filter((child) => {
            const keywords = ['Scenario Outline', 'Scenario Template'];
            return child.scenario && keywords.indexOf(child.scenario.keyword) !== -1;
        })
            .map((astScenarioOutline) => this.parseScenarioOutline(astScenarioOutline, astFeature));
    };
    collapseBackgrounds = (astChildren, backgrounds) => {
        const backgroundSteps = backgrounds.reduce((allBackgroundSteps, nextBackground) => {
            return [...allBackgroundSteps, ...nextBackground.steps];
        }, []);
        for (const child of astChildren) {
            if (child.scenario) {
                child.scenario.steps = [...backgroundSteps, ...child.scenario.steps];
            }
        }
        return astChildren;
    };
    parseBackgrounds = (ast) => {
        return ast.children.filter((child) => child.background).map((child) => child.background);
    };
    collapseRulesAndBackgrounds = (astFeature) => {
        const featureBackgrounds = this.parseBackgrounds(astFeature);
        const children = this.collapseBackgrounds(astFeature.children, featureBackgrounds).reduce((newChildren, nextChild) => {
            if (nextChild.rule) {
                const rule = nextChild.rule;
                const ruleBackgrounds = this.parseBackgrounds(rule);
                return [
                    ...newChildren,
                    ...this.collapseBackgrounds(rule.children, [...featureBackgrounds, ...ruleBackgrounds])
                ];
            }
            else {
                return [...newChildren, nextChild];
            }
        }, []);
        return {
            ...astFeature,
            children
        };
    };
    createTranslationMap = (translateDialect) => {
        const englishDialect = src_1.dialects.en;
        const translationMap = {};
        const props = [
            'and',
            'background',
            'but',
            'examples',
            'feature',
            'given',
            'scenario',
            'scenarioOutline',
            'then',
            'when',
            'rule'
        ];
        for (const prop of props) {
            const dialectWords = translateDialect[prop];
            const translationWords = englishDialect[prop];
            let index = 0;
            let defaultWordIndex = null;
            for (const dialectWord of dialectWords) {
                // skip "* " word
                if (dialectWord.indexOf('*') !== 0) {
                    if (translationWords[index] !== undefined) {
                        translationMap[dialectWord] = translationWords[index];
                        if (defaultWordIndex === null) {
                            // set default when non is set yet
                            defaultWordIndex = index;
                        }
                    }
                    else {
                        // index has undefined value, translate to default word
                        if (defaultWordIndex !== null) {
                            translationMap[dialectWord] = translationWords[defaultWordIndex];
                        }
                        else {
                            throw new Error('No translation found for ' + dialectWord);
                        }
                    }
                }
                index++;
            }
        }
        return translationMap;
    };
    translateKeywords = (astFeature) => {
        const languageDialect = src_1.dialects[astFeature.language];
        const translationMap = this.createTranslationMap(languageDialect);
        astFeature.language = 'en';
        astFeature.keyword = translationMap[astFeature.keyword] || astFeature.keyword;
        for (const child of astFeature.children) {
            if (child.background) {
                child.background.keyword = translationMap[child.background.keyword] || child.background.keyword;
            }
            if (child.scenario) {
                child.scenario.keyword = translationMap[child.scenario.keyword] || child.scenario.keyword;
                for (const step of child.scenario.steps) {
                    step.keyword = translationMap[step.keyword] || step.keyword;
                }
                for (const example of child.scenario.examples) {
                    example.keyword = translationMap[example.keyword] || example.keyword;
                }
            }
        }
        return astFeature;
    };
}
exports.default = GherkinFeature;
//# sourceMappingURL=gherkin-feature.js.map