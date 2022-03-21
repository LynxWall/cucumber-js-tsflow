module.exports = {
	default: [
		'cucumber-tsflow-specs/features/**/*.feature',
		'--require node_modules/@lynxwall/cucumber-tsflow/lib/tsvue.js',
		'--require cucumber-tsflow-specs/src/step_definitions/**/*.ts',
		'--format node_modules/@lynxwall/cucumber-tsflow/lib/behave:cucumber-tsflow-specs/cucumber_report.json',
		'--format html:cucumber-tsflow-specs/cucumber_report.html',
		'--format-options \'{"snippetSyntax": "node_modules/@lynxwall/cucumber-tsflow/lib/tsflow"}\'',
		'--publish-quiet'
	].join(' ')
};
