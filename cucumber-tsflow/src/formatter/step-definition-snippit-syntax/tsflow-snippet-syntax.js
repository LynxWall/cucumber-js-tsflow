"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const snippet_syntax_1 = require("@cucumber/cucumber/lib/formatter/step_definition_snippet_builder/snippet_syntax");
const CALLBACK_NAME = 'callback';
const toCamelCase = (str) => {
    return str
        .replace(/\s(.)/g, function ($1) {
        return $1.toUpperCase();
    })
        .replace(/\s/g, '')
        .replace(/[^\w]/g, '')
        .replace(/^(.)/, function ($1) {
        return $1.toLowerCase();
    });
};
/**
 * format cucumber expression parameters for typescript
 * @param parameters
 * @returns
 */
const formatParameters = (parameters) => {
    const params = parameters.map(param => {
        return `${param}: ${matchType(param)}`;
    });
    return params.join(', ');
};
/**
 * match the parameter name passed in with a typescript
 * primitive type (string, number or boolean)
 * @param paramName
 * @returns
 */
const matchType = (paramName) => {
    const numberTypes = ['int', 'float', 'bigdecimal', 'double', 'biginteger', 'byte', 'short', 'long'];
    const stringTypes = ['string', 'word'];
    if (stringTypes.find(x => paramName.indexOf(x) >= 0)) {
        return 'string';
    }
    if (numberTypes.find(x => paramName.indexOf(x) >= 0)) {
        return 'number';
    }
    if (paramName.indexOf('boolean') >= 0) {
        return 'boolean';
    }
    return 'any';
};
/**
 * Generate snippets for tsflow.
 */
class TsflowSnippetSyntax {
    snippetInterface;
    constructor(snippetInterface) {
        this.snippetInterface = snippetInterface;
    }
    build({ comment, generatedExpressions, functionName, stepParameterNames }) {
        let functionKeyword = '';
        if (this.snippetInterface === snippet_syntax_1.SnippetInterface.AsyncAwait) {
            functionKeyword = 'async ';
        }
        let implementation;
        if (this.snippetInterface === snippet_syntax_1.SnippetInterface.Callback) {
            implementation = `${CALLBACK_NAME}(null, 'pending');`;
        }
        else if (this.snippetInterface === snippet_syntax_1.SnippetInterface.Promise) {
            implementation = "return Promise.resolve('pending');";
        }
        else {
            implementation = "return 'pending';";
        }
        // we only care about the first expression. TypeScript has a
        // small number of primitive types
        const generatedExpression = generatedExpressions[0];
        const allParameterNames = generatedExpression.parameterNames.concat(stepParameterNames);
        if (this.snippetInterface === snippet_syntax_1.SnippetInterface.Callback) {
            allParameterNames.push(CALLBACK_NAME);
        }
        const pattern = generatedExpression.source.replace(/'/g, "\\'");
        const methodName = toCamelCase(pattern);
        const parametersStr = allParameterNames.length > 0 ? formatParameters(allParameterNames) : '';
        const definitionChoices = `@${functionName.toLowerCase()}('${pattern}')\n` + `${functionKeyword}${methodName}(${parametersStr}): any {\n`;
        return `${definitionChoices}  //${comment}\n  ${implementation}\n}`;
    }
}
exports.default = TsflowSnippetSyntax;
//# sourceMappingURL=tsflow-snippet-syntax.js.map