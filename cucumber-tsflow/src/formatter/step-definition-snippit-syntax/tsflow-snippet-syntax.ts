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
 * format cucumber expression parameters for typescript
 * @param parameters
 * @returns
 */
const formatParameters = (parameters: string[]): string => {
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
const matchType = (paramName: string): string => {
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
export default class TsflowSnippetSyntax implements ISnippetSnytax {
	private readonly snippetInterface: SnippetInterface;

	constructor(snippetInterface: SnippetInterface) {
		this.snippetInterface = snippetInterface;
	}

	build({ comment, generatedExpressions, functionName, stepParameterNames }: ISnippetSyntaxBuildOptions): string {
		let functionKeyword = '';
		if (this.snippetInterface === SnippetInterface.AsyncAwait) {
			functionKeyword = 'async ';
		}
		let implementation: string;
		if (this.snippetInterface === SnippetInterface.Callback) {
			implementation = `${CALLBACK_NAME}(null, 'pending');`;
		} else if (this.snippetInterface === SnippetInterface.Promise) {
			implementation = "return Promise.resolve('pending');";
		} else {
			implementation = "return 'pending';";
		}
		// we only care about the first expression. TypeScript has a
		// small number of primitive types
		const generatedExpression = generatedExpressions[0];
		const allParameterNames = generatedExpression.parameterNames.concat(stepParameterNames);
		if (this.snippetInterface === SnippetInterface.Callback) {
			allParameterNames.push(CALLBACK_NAME);
		}
		const pattern = generatedExpression.source.replace(/'/g, "\\'");
		const methodName = toCamelCase(pattern);
		const parametersStr = allParameterNames.length > 0 ? formatParameters(allParameterNames) : '';
		const definitionChoices =
			`@${functionName.toLowerCase()}('${pattern}')\n` + `${functionKeyword}${methodName}(${parametersStr}): any {\n`;

		return `${definitionChoices}  //${comment}\n  ${implementation}\n}`;
	}
}
