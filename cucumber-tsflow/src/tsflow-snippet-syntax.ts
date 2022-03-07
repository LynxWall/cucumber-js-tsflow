import {
	ISnippetSnytax,
	ISnippetSyntaxBuildOptions,
	SnippetInterface
} from '@cucumber/cucumber/lib/formatter/step_definition_snippet_builder/snippet_syntax';

const CALLBACK_NAME = 'callback';

const toCamelCase = (str: string) => {
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
 * Generate snippets for tsflow.
 * NOTE: Needs to be an exported function for cucumber to
 * load this correctly from common.js configuration
 * @param snippetInterface
 * @returns
 */
export function TsflowSnippetSyntax(snippetInterface: SnippetInterface): ISnippetSnytax {
	return {
		build({ comment, generatedExpressions, functionName, stepParameterNames }: ISnippetSyntaxBuildOptions): string {
			let functionKeyword = '';
			if (snippetInterface === SnippetInterface.AsyncAwait) {
				functionKeyword = 'async ';
			} else if (snippetInterface === SnippetInterface.Generator) {
				functionKeyword = '*';
			}

			let implementation: string;
			if (snippetInterface === SnippetInterface.Callback) {
				implementation = `${CALLBACK_NAME}(null, 'pending');`;
			} else if (snippetInterface === SnippetInterface.Promise) {
				implementation = "return Promise.resolve('pending');";
			} else {
				implementation = "return 'pending';";
			}

			const definitionChoices = generatedExpressions.map((generatedExpression, index) => {
				const prefix = index === 0 ? '' : '// ';
				const allParameterNames = generatedExpression.parameterNames.concat(stepParameterNames);
				if (snippetInterface === SnippetInterface.Callback) {
					allParameterNames.push(CALLBACK_NAME);
				}
				const pattern = generatedExpression.source.replace(/'/g, "\\'");
				const methodName = toCamelCase(pattern);
				const parametersStr = allParameterNames.length > 0 ? allParameterNames.join(': any, ') + ': any' : '';
				return (
					prefix +
					'@' +
					functionName.toLowerCase() +
					"('" +
					pattern +
					"')\n" +
					functionKeyword +
					methodName +
					'(' +
					parametersStr +
					'): any {\n'
				);
			});

			return definitionChoices.join('') + '  // ' + comment + '\n' + '  ' + implementation + '\n}';
		}
	};
}
// This is needed so that cucumber.js can load the function
module.exports = TsflowSnippetSyntax;
