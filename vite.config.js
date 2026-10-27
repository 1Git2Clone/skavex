import jsdoc from 'eslint-plugin-jsdoc';
import { defineConfig } from 'vite-plus';

// Formatting and linting only. Vite+ reads both blocks from the nearest
// vite.config.*, and nothing else here reads this file: vitest.config.js takes
// precedence over it for the unit suite, the demo has its own config, and
// test/browser.test.js builds with `configFile: false`.
//
// `vite` itself stays the real package, not an alias to vite-plus-core the way
// the two sites have it. skavex is a Vite plugin with `vite` as a peer
// dependency, so the suite has to run against the Vite its consumers install.

// eslint-plugin-jsdoc runs as an Oxlint JS plugin, under its own name so it
// cannot collide with Oxlint's native jsdoc plugin, which covers only part of
// what is enforced below. JS plugins are alpha and not semver-stable, which is
// why vite-plus is pinned exactly.
//
// Throws rather than defaulting to `{}`: a renamed preset would otherwise drop
// every rule it carried and leave the lint green.
const { rules } = jsdoc.configs['flat/recommended-typescript-flavor-error'];
if (!rules) throw new Error('eslint-plugin-jsdoc no longer ships its typescript-flavor preset');
const recommended = Object.fromEntries(
	Object.entries(rules).map(([rule, level]) => [rule.replace(/^jsdoc\//, 'jsdoc-js/'), level])
);

// `false` bans the type outright. `any` disables every check the rest of this
// config exists to perform, and a library whose types ARE its JSDoc cannot ship
// it. Where a value genuinely is not known, `unknown` says so and forces the
// narrowing that `any` skips.
const noAny = { any: false, '*': false };

export default defineConfig({
	fmt: {
		useTabs: true,
		singleQuote: true,
		trailingComma: 'none',
		printWidth: 100,
		svelte: {},
		// package.json is the published manifest. Its key and keyword order are
		// written for the npm page, not alphabetical.
		sortPackageJson: false,
		ignorePatterns: [
			'pnpm-lock.yaml',
			'flake.lock',
			'test/.tmp/**',
			'types/**',
			'demo/dist/**',
			'docs/book/**',
			'.pre-commit-cache/**',
			'test-results/**',
			'playwright-report/**',
			'demo/.svelte-check/**'
		]
	},

	lint: {
		// Oxlint reads .gitignore, unlike eslint's flat config, so the generated
		// trees (demo/.svelte-check, docs/book, coverage, the pre-commit cache)
		// are skipped without being listed. The fixtures are tracked, and are
		// deliberately not code anyone here would write.
		ignorePatterns: ['test/fixtures/**'],
		jsPlugins: [{ name: 'jsdoc-js', specifier: 'eslint-plugin-jsdoc' }],
		env: { es2024: true, node: true },
		rules: { 'no-undef': 'error' },
		overrides: [
			// The source is JavaScript and its types are the JSDoc on it, so the
			// JSDoc is not documentation that may drift — it IS the type
			// declaration shipped to consumers. These rules are what makes that
			// claim enforceable rather than aspirational.
			{
				files: ['**/*.js'],
				rules: {
					...recommended,

					// Types come from the JSDoc, so a missing one is a missing type.
					'jsdoc-js/require-param-type': 'error',
					'jsdoc-js/require-returns-type': 'error',
					'jsdoc-js/check-types': 'error',
					'jsdoc-js/no-undefined-types': 'error',
					'jsdoc-js/check-param-names': 'error',
					'jsdoc-js/require-param': 'error',
					'jsdoc-js/require-returns': 'error',
					'jsdoc-js/require-returns-check': 'error',

					// Every exported function is public API and gets documented. Arrow
					// functions and class methods are exempt only where they are local.
					'jsdoc-js/require-jsdoc': [
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
					'jsdoc-js/require-description': [
						'error',
						{ contexts: ['FunctionDeclaration'] }
					],
					'jsdoc-js/empty-tags': 'error',
					'jsdoc-js/check-alignment': 'error',
					// NOT `typed: true`: that setting is for TypeScript files, where @type
					// really is redundant. Here the JSDoc is the only type information
					// there is.
					'jsdoc-js/check-tag-names': 'error',

					// A blank line between the description and the tags. The default
					// wants none, which packs every block into a wall.
					'jsdoc-js/tag-lines': ['error', 'any', { startLines: 1 }]
				}
			},

			// Tests, benchmarks and scripts still may not use `any` — that ban is
			// the point and it applies everywhere. What they are spared is mandatory
			// prose on every parameter: a description that only restates the
			// parameter's name is filler, and filler is what makes people stop
			// reading the real ones.
			{
				files: ['test/**', 'bench/**', 'e2e/**', 'scripts/**', 'demo/**'],
				rules: {
					'jsdoc-js/require-param-description': 'off',
					'jsdoc-js/require-returns-description': 'off',
					'jsdoc-js/require-description': 'off'
				}
			},

			// The tests write plugins exactly the way README.md and docs/ tell a
			// reader to, `{ ...(file.data.fm ?? {}), ... }` included. A test that
			// reads differently from the documented pattern stops proving it.
			{
				files: ['test/**'],
				rules: { 'unicorn/no-useless-fallback-in-spread': 'off' }
			},

			// The ban on `any` reaches the one file a visitor to the demo actually
			// runs, too. Oxlint lints a component's <script> block natively.
			{
				files: ['**/*.svelte'],
				env: { browser: true },
				// Runes are compiler syntax, not imports, and no-undef cannot know that.
				globals: Object.fromEntries(
					[
						'$state',
						'$derived',
						'$effect',
						'$props',
						'$bindable',
						'$inspect',
						'$host'
					].map((rune) => [rune, 'readonly'])
				),
				rules: { 'jsdoc-js/check-types': 'error' }
			},

			// The demo runs in a browser, not in node. Its vite config is the
			// exception: that one is build-time and reads process.env.
			{
				files: ['demo/src/**'],
				env: { browser: true },
				// Substituted at build time by vite.config.js, which reads it from
				// package.json so the footer cannot state a stale version.
				globals: { __APP_VERSION__: 'readonly' }
			}
		],
		settings: {
			jsdoc: {
				mode: 'typescript',
				preferredTypes: { ...noAny, Object: 'object', Function: false, 'Array<>': '[]' }
			}
		}
	}
});
