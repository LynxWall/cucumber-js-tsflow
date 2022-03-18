module.exports = {
	default: [
		'cucumber-tsflow-specs/features/**/*.feature',
		'--require node_modules/@lynxwall/cucumber-tsflow/dist/tsvue.js',
		'--require-module tsconfig-paths/register',
		'--require cucumber-tsflow-specs/src/step_definitions/**/*.ts',
		'--format node_modules/@lynxwall/cucumber-tsflow/dist/behave:cucumber-tsflow-specs/cucumber_report.json',
		'--format html:cucumber-tsflow-specs/cucumber_report.html',
		'--format-options \'{"snippetSyntax": "node_modules/@lynxwall/cucumber-tsflow/dist/tsflow"}\'',
		'--publish-quiet'
	].join(' ')
};
