import js from '@eslint/js';
import jsdoc from 'eslint-plugin-jsdoc';
import svelte from 'eslint-plugin-svelte';
import svelteParser from 'svelte-eslint-parser';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
	{
		ignores: [
			'node_modules/**',
			'test/.tmp/**',
			'test/fixtures/**',
			'demo/dist/**',
			// mdbook's rendered output: vendored highlight.js and its own theme
			// scripts, none of it written here.
			'docs/book/**',
			// pre-commit's hook environments, which include a vendored pip and so
			// a good deal of JavaScript nobody here wrote. Lands in the working
			// tree rather than under HOME because CI's runner has no writable one.
			'.pre-commit-cache/**',
			// svelte-check --tsgo writes a shadow workspace here: a generated .js
			// per .svelte file, full of the compiler's own globals (svelteHTML,
			// __sveltets_*). Nobody wrote it and no rule applies to it. Ignored
			// here as well as in .gitignore because eslint does not read that file
			// — `eslint .` walks the filesystem, which is how `pnpm lint` found 83
			// errors in it while the pre-commit hook, which passes an explicit
			// list of tracked files, saw none.
			'demo/.svelte-check/**',
			'coverage/**'
		]
	},
	js.configs.recommended,
	prettier,
	{
		languageOptions: {
			ecmaVersion: 2024,
			sourceType: 'module',
			globals: { ...globals.node }
		}
	},

	// The source is JavaScript and its types are the JSDoc on it, so the JSDoc
	// is not documentation that may drift — it IS the type declaration shipped
	// to consumers. These rules are what makes that claim enforceable rather
	// than aspirational.
	{
		files: ['**/*.js'],
		plugins: { jsdoc },
		settings: {
			jsdoc: {
				mode: 'typescript',
				// `false` bans the type outright. `any` disables every check the
				// rest of this config exists to perform, and a library whose types
				// ARE its JSDoc cannot ship it. Where a value genuinely is not
				// known, `unknown` says so and forces the narrowing that `any`
				// skips.
				preferredTypes: {
					any: false,
					'*': false,
					Object: 'object',
					Function: false,
					'Array<>': '[]'
				}
			}
		},
		rules: {
			...jsdoc.configs['flat/recommended-typescript-flavor-error'].rules,

			// Types come from the JSDoc, so a missing one is a missing type.
			'jsdoc/require-param-type': 'error',
			'jsdoc/require-returns-type': 'error',
			'jsdoc/check-types': 'error',
			'jsdoc/no-undefined-types': 'error',
			'jsdoc/check-param-names': 'error',
			'jsdoc/require-param': 'error',
			'jsdoc/require-returns': 'error',
			'jsdoc/require-returns-check': 'error',

			// Every exported function is public API and gets documented. Arrow
			// functions and class methods are exempt only where they are local.
			'jsdoc/require-jsdoc': [
				'error',
				{
					publicOnly: true,
					require: {
						FunctionDeclaration: true,
						FunctionExpression: true,
						ArrowFunctionExpression: true,
						ClassDeclaration: true,
						MethodDefinition: true
					}
				}
			],

			// A description that is only the function's name repeated is worse
			// than none, but an empty one is what actually misleads.
			'jsdoc/require-description': ['error', { contexts: ['FunctionDeclaration'] }],
			'jsdoc/empty-tags': 'error',
			'jsdoc/check-alignment': 'error',
			// NOT `typed: true`: that setting is for TypeScript files, where @type
			// really is redundant. Here the JSDoc is the only type information
			// there is.
			'jsdoc/check-tag-names': 'error',

			// A blank line between the description and the tags. The default wants
			// none, which packs every block into a wall.
			'jsdoc/tag-lines': ['error', 'any', { startLines: 1 }]
		}
	},

	// Tests, benchmarks and scripts still may not use `any` — that ban is the
	// point and it applies everywhere. What they are spared is mandatory prose
	// on every parameter: a description that only restates the parameter's name
	// is filler, and filler is what makes people stop reading the real ones.
	{
		files: ['test/**', 'bench/**', 'e2e/**', 'scripts/**', 'demo/**'],
		rules: {
			'jsdoc/require-param-description': 'off',
			'jsdoc/require-returns-description': 'off',
			'jsdoc/require-description': 'off'
		}
	},

	// Components were a hole in every rule above: without a parser, eslint skips
	// .svelte entirely, so the ban on `any` did not reach the one file a visitor
	// to the demo actually runs.
	...svelte.configs['flat/recommended'],
	{
		files: ['**/*.svelte'],
		plugins: { jsdoc },
		languageOptions: {
			parser: svelteParser,
			globals: { ...globals.browser }
		},
		settings: {
			jsdoc: { mode: 'typescript', preferredTypes: { any: false, '*': false } }
		},
		rules: {
			'jsdoc/check-types': 'error',
			'jsdoc/no-restricted-syntax': 'off'
		}
	},

	// The demo runs in a browser, not in node. Its vite config is the exception:
	// that one is build-time and reads process.env.
	{
		files: ['demo/src/**'],
		languageOptions: {
			globals: {
				...globals.browser,
				// Substituted at build time by vite.config.js, which reads it from
				// package.json so the footer cannot state a stale version.
				__APP_VERSION__: 'readonly'
			}
		}
	}
];
