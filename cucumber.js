module.exports = {
	default: [
		'cucumber-tsflow-specs/features/**/*.feature',
		'--require cucumber-tsflow-specs/cucumber.setup.js',
		'--require-module tsconfig-paths/register',
		'--require cucumber-tsflow-specs/src/step_definitions/**/*.ts',
		'--format cucumber-tsflow/dist/behave-json-formatter:cucumber-tsflow-specs/cucumber_report.json',
		'--format html:cucumber-tsflow-specs/cucumber_report.html',
		'--format-options \'{"snippetSyntax": "cucumber-tsflow/dist/tsflow-snippet-syntax"}\'',
		'--publish-quiet'
	].join(' ')
};
