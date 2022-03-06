module.exports = {
	default: [
		'cucumber-tsflow-specs/features/**/*.feature',
		'--require cucumber-tsflow-specs/cucumber.setup.js',
		'--require-module tsconfig-paths/register',
		'--require cucumber-tsflow-specs/src/step_definitions/**/*.ts',
		'--format cucumber-tsflow/dist/behave-formatter:cucumber-tsflow-specs/cucumber_report.json',
		'--format html:cucumber-tsflow-specs/cucumber_report.html',
		'--publish-quiet'
	].join(' ')
};
