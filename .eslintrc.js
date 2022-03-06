module.exports = {
	root: true,
	env: {
		node: true
	},
	globals: {
		defineProps: 'readonly',
		defineEmits: 'readonly'
	},
	extends: ['eslint:recommended', 'prettier'],
	rules: {
		'@typescript-eslint/no-var-requires': 'off',
		'no-unused-vars': 'off',
		'no-console': process.env.NODE_ENV === 'production' ? 'error' : 'off',
		// allow paren-less arrow functions
		'arrow-parens': 0,
		// allow async-await
		'generator-star-spacing': 0,
		// allow debugger during development
		'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'off',
		semi: [1, 'always'],
		'no-irregular-whitespace': 0,
		'space-before-function-paren': [
			'error',
			{
				anonymous: 'always',
				named: 'never',
				asyncArrow: 'always'
			}
		]
	}
};
