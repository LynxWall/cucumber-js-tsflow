import * as path from 'path';
import * as fs from 'fs';
import { glob } from 'glob';
import * as messages from '@cucumber/messages';
import { getJestCucumberConfiguration, Options } from './configuration';
import { AstBuilder, GherkinClassicTokenMatcher, Parser, Dialect, dialects } from '@cucumber/gherkin/dist/src';
import { ParsedFeature, ParsedScenario, ParsedStep, ParsedScenarioOutline } from './models';

export default class GherkinFeature {
	private cwd = process.cwd();

	public loadFeature = async (featureFilePath: string, addCwd: boolean, options?: Options) => {
		try {
			if (addCwd) {
				featureFilePath = path.join(this.cwd, featureFilePath);
			}
			const featureText: string = await fs.promises.readFile(featureFilePath, { encoding: 'utf8' });
			return this.parseFeature(featureText, featureFilePath, options);
		} catch (err: any) {
			if (err.code === 'ENOENT') {
				throw new Error(`Feature file not found (${featureFilePath})`);
			} else {
				throw err;
			}
		}
	};

	public loadFeatures = async (globPattern: string, options?: Options) => {
		const featureFiles = await glob(globPattern, { cwd: this.cwd });

		return await Promise.all(featureFiles.map(featureFilePath => this.loadFeature(featureFilePath, true, options)));
	};

	public parseFeature = (featureText: string, featureFilePath: string, options?: Options): ParsedFeature => {
		let ast: any;
		options = getJestCucumberConfiguration(options);

		try {
			const builder = new AstBuilder(messages.IdGenerator.uuid());
			const matcher = new GherkinClassicTokenMatcher(); // or Gherkin.GherkinInMarkdownTokenMatcher()
			ast = new Parser(builder, matcher).parse(featureText);
		} catch (err: any) {
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
		} as ParsedFeature;
	};

	private parseDataTableRow = (astDataTableRow: any) => {
		return astDataTableRow.cells.map((col: any) => col.value) as string[];
	};

	private parseDataTable = (astDataTable: any, astDataTableHeader?: any) => {
		let headerRow: string[];
		let bodyRows: string[];

		if (astDataTableHeader) {
			headerRow = this.parseDataTableRow(astDataTableHeader);
			bodyRows = astDataTable;
		} else {
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
		} else {
			return [];
		}
	};

	private parseStepArgument = (astStep: any) => {
		if (astStep) {
			switch (astStep.argument) {
				case 'dataTable':
					return this.parseDataTable(astStep.dataTable);
				case 'docString':
					return astStep.docString.content;
				default:
					return null;
			}
		} else {
			return null;
		}
	};

	private parseStep = (astStep: any) => {
		return {
			stepText: astStep.text,
			keyword: astStep.keyword.trim().toLowerCase() as string,
			stepArgument: this.parseStepArgument(astStep),
			lineNumber: astStep.location.line
		} as ParsedStep;
	};

	private parseSteps = (astScenario: any) => {
		return astScenario.steps.map((astStep: any) => this.parseStep(astStep));
	};

	private parseTags = (ast: any) => {
		if (!ast.tags) {
			return [] as string[];
		} else {
			return ast.tags.map((tag: any) => tag.name);
		}
	};

	private parseScenario = (astScenario: any, astFeature: any) => {
		return {
			title: astScenario.name,
			steps: this.parseSteps(astScenario),
			tags: [...this.parseTags(astFeature), ...this.parseTags(astScenario)],
			lineNumber: astScenario.location.line,
			scenarioContext: undefined
		} as ParsedScenario;
	};

	private parseScenarioOutlineExampleSteps = (exampleTableRow: any, scenarioSteps: ParsedStep[]) => {
		return scenarioSteps.map(scenarioStep => {
			const stepText = Object.keys(exampleTableRow).reduce((processedStepText, nextTableColumn) => {
				return processedStepText.replace(new RegExp(`<${nextTableColumn}>`, 'g'), exampleTableRow[nextTableColumn]);
			}, scenarioStep.stepText);

			let stepArgument: string | object = '';

			if (scenarioStep.stepArgument) {
				if (Array.isArray(scenarioStep.stepArgument)) {
					stepArgument = (scenarioStep.stepArgument as any).map((stepArgumentRow: any) => {
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
									modifiedStepArgumentRow[prop] = modifiedStepArgumentRow[prop].replace(
										new RegExp(`<${nextTableColumn}>`, 'g'),
										exampleTableRow[nextTableColumn]
									);
								}
							}
						}
						return modifiedStepArgumentRow;
					});
				} else {
					stepArgument = scenarioStep.stepArgument;
					if (typeof scenarioStep.stepArgument === 'string' || scenarioStep.stepArgument instanceof String) {
						const exampleKeys = Object.keys(exampleTableRow);
						const exampleLen = exampleKeys.length;
						if (exampleKeys.length > 0) {
							for (let exampleIdx = 0; exampleIdx < exampleLen; exampleIdx++) {
								const nextTableColumn = exampleKeys[exampleIdx];
								stepArgument = (stepArgument as string).replace(
									new RegExp(`<${nextTableColumn}>`, 'g'),
									exampleTableRow[nextTableColumn]
								);
							}
						}
					}
				}
			}

			return {
				...scenarioStep,
				stepText,
				stepArgument
			} as ParsedStep;
		});
	};

	private getOutlineDynamicTitle = (exampleTableRow: any, title: string) => {
		return title.replace(/<(\S*)>/g, (_, firstMatch) => {
			return exampleTableRow[firstMatch || ''];
		});
	};

	private parseScenarioOutlineExample = (
		exampleTableRow: any,
		outlineScenario: ParsedScenario,
		exampleSetTags: string[]
	) => {
		return {
			title: this.getOutlineDynamicTitle(exampleTableRow, outlineScenario.title),
			steps: this.parseScenarioOutlineExampleSteps(exampleTableRow, outlineScenario.steps),
			tags: Array.from(new Set<string>([...outlineScenario.tags, ...exampleSetTags])),
			exampleRow: exampleTableRow
		} as ParsedScenario;
	};

	private parseScenarioOutlineExampleSet = (astExampleSet: any, outlineScenario: ParsedScenario) => {
		const exampleTable = this.parseDataTable(astExampleSet.tableBody, astExampleSet.tableHeader);

		return exampleTable.map(tableRow =>
			this.parseScenarioOutlineExample(tableRow, outlineScenario, this.parseTags(astExampleSet))
		);
	};

	private parseScenarioOutlineExampleSets = (astExampleSets: any, outlineScenario: ParsedScenario) => {
		const exampleSets = astExampleSets.map((astExampleSet: any) => {
			return this.parseScenarioOutlineExampleSet(astExampleSet, outlineScenario);
		});

		return exampleSets.reduce((scenarios: ParsedScenario[], nextExampleSet: ParsedScenario[][]) => {
			return [...scenarios, ...nextExampleSet];
		}, [] as ParsedScenario[]);
	};

	private parseScenarioOutline = (astScenarioOutline: any, astFeature: any) => {
		const outlineScenario = this.parseScenario(astScenarioOutline.scenario, astFeature);

		return {
			title: outlineScenario.title,
			tags: outlineScenario.tags,
			exampleScenarios: this.parseScenarioOutlineExampleSets(astScenarioOutline.scenario.examples, outlineScenario),
			steps: outlineScenario.steps,
			lineNumber: astScenarioOutline.scenario.location.line,
			scenarioContext: undefined
		} as ParsedScenarioOutline;
	};

	private parseScenarios = (astFeature: any) => {
		return astFeature.children
			.filter((child: any) => {
				const keywords = ['Scenario Outline', 'Scenario Template'];

				return child.scenario && keywords.indexOf(child.scenario.keyword) === -1;
			})
			.map((astScenario: any) => this.parseScenario(astScenario.scenario, astFeature));
	};

	private parseScenarioOutlines = (astFeature: any) => {
		return astFeature.children
			.filter((child: any) => {
				const keywords = ['Scenario Outline', 'Scenario Template'];

				return child.scenario && keywords.indexOf(child.scenario.keyword) !== -1;
			})
			.map((astScenarioOutline: any) => this.parseScenarioOutline(astScenarioOutline, astFeature));
	};

	private collapseBackgrounds = (astChildren: any[], backgrounds: any[]) => {
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

	private parseBackgrounds = (ast: any) => {
		return ast.children.filter((child: any) => child.background).map((child: any) => child.background);
	};

	private collapseRulesAndBackgrounds = (astFeature: any) => {
		const featureBackgrounds = this.parseBackgrounds(astFeature);

		const children = this.collapseBackgrounds(astFeature.children, featureBackgrounds).reduce(
			(newChildren: [], nextChild: any) => {
				if (nextChild.rule) {
					const rule = nextChild.rule;
					const ruleBackgrounds = this.parseBackgrounds(rule);

					return [
						...newChildren,
						...this.collapseBackgrounds(rule.children, [...featureBackgrounds, ...ruleBackgrounds])
					];
				} else {
					return [...newChildren, nextChild];
				}
			},
			[]
		);

		return {
			...astFeature,
			children
		};
	};
	private createTranslationMap = (translateDialect: Dialect) => {
		const englishDialect = dialects.en;
		const translationMap: { [word: string]: string } = {};

		const props: Array<keyof Dialect> = [
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
			let defaultWordIndex: number | null = null;

			for (const dialectWord of dialectWords) {
				// skip "* " word
				if (dialectWord.indexOf('*') !== 0) {
					if (translationWords[index] !== undefined) {
						translationMap[dialectWord] = translationWords[index];
						if (defaultWordIndex === null) {
							// set default when non is set yet
							defaultWordIndex = index;
						}
					} else {
						// index has undefined value, translate to default word
						if (defaultWordIndex !== null) {
							translationMap[dialectWord] = translationWords[defaultWordIndex];
						} else {
							throw new Error('No translation found for ' + dialectWord);
						}
					}
				}

				index++;
			}
		}

		return translationMap;
	};

	private translateKeywords = (astFeature: any) => {
		const languageDialect = dialects[astFeature.language];
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
