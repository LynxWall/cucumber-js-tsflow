module.exports = {
	root: true,
	env: {
		node: true
	},
	globals: {
		defineProps: 'readonly',
		defineEmits: 'readonly'
	},
	extends: ['plugin:vue/vue3-strongly-recommended', 'eslint:recommended', '@vue/typescript', 'prettier'],
	rules: {
		'@typescript-eslint/no-var-requires': 'off',
		'@typescript-eslint/no-explicit-any': 'off',
		'no-unused-vars': 'off',
		'no-unused-vars': 'off',
		'vue/no-useless-template-attributes': 'off',
		'vue/multi-word-component-names': 'off',
		'vue/max-attributes-per-line': 'off',
		'vue/no-v-model-argument': 'off',
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
