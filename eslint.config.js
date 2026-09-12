import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
	{ ignores: ['node_modules/**', 'test/.tmp/**', 'test/fixtures/**'] },
	js.configs.recommended,
	prettier,
	{
		languageOptions: {
			ecmaVersion: 2024,
			sourceType: 'module',
			globals: { ...globals.node }
		}
	}
];
