import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
	{ ignores: ['node_modules/**', 'test/.tmp/**', 'test/fixtures/**', 'demo/dist/**'] },
	js.configs.recommended,
	prettier,
	{
		languageOptions: {
			ecmaVersion: 2024,
			sourceType: 'module',
			globals: { ...globals.node }
		}
	},
	// The demo runs in a browser, not in node. Its vite config is the exception:
	// that one is build-time and reads process.env.
	{
		files: ['demo/src/**'],
		languageOptions: { globals: globals.browser }
	}
];
