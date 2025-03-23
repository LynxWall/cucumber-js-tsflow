import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import { FlatCompat } from '@eslint/eslintrc';
import pluginVue from 'eslint-plugin-vue';
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
	baseDirectory: __dirname,
	recommendedConfig: js.configs.recommended,
	allConfig: js.configs.all
});

export default defineConfigWithVueTs([
	pluginVue.configs['flat/strongly-recommended'],
	vueTsConfigs.recommended,
	globalIgnores([
		'**/node_modules',
		'**/wwwroot',
		'**/dist',
		'**/dist-ssr',
		'**/lib',
		'**/lib-ssr',
		'**/.env.local',
		'**/.env.*.local',
		'**/npm-debug.log*',
		'**/yarn-debug.log*',
		'**/yarn-error.log*',
		'**/pnpm-debug.log*',
		'**/.idea',
		'**/*.suo',
		'**/*.ntvs*',
		'**/*.njsproj',
		'**/*.sw?',
		'**/*.user',
		'**/.vs',
		'**/_ReSharper*/',
		'**/*.[Rr]e[Ss]harper',
		'**/*.DotSettings.user',
		'**/*.dotCover',
		'**/*.[Cc]ache',
		'!**/*.[Cc]ache/'
	]),
	{
		extends: compat.extends('eslint:recommended', 'prettier'),

		languageOptions: {
			globals: {
				...globals.node,
				defineProps: 'readonly',
				defineEmits: 'readonly'
			}
		},
		rules: {
			'@typescript-eslint/no-var-requires': 'off',
			'@typescript-eslint/strict-boolean-expressions': 'off',
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/no-inferrable-types': 'off',
			'@typescript-eslint/no-empty-function': 'off',
			'@typescript-eslint/ban-types': 'off',
			'@typescript-eslint/no-unused-vars': 'off',
			'@typescript-eslint/no-unused-expressions': 'off',
			'@typescript-eslint/no-unsafe-function-type': 'off',
			'@typescript-eslint/no-require-imports': 'off',
			'no-unused-vars': 'off',
			'prefer-rest-params': 'off',
			'vue/no-useless-template-attributes': 'off',
			'vue/multi-word-component-names': 'off',
			'vue/max-attributes-per-line': 'off',
			'vue/no-v-model-argument': 'off',
			'no-console': process.env.NODE_ENV === 'production' ? 'error' : 'off',
			'arrow-parens': 0,
			'generator-star-spacing': 0,
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
	}
]);
