import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { exports: entries } = require('../package.json');

/**
 * The public API, entry point by entry point.
 *
 * This test exists because the surface had drifted into a list of whatever
 * happened to be exported: `escapeText`, `findComponents`, `resolveComponentsDir`
 * and three unified plugins sat in the main entry beside `compile`, not because
 * anyone decided they were API but because something once needed them.
 *
 * A published export is a promise. Adding one here should be a decision, and
 * this test is what makes it one — a new export fails until it is written down.
 */
/** @type {Record<string, string[]>} */
const SURFACE = {
	'.': ['compile', 'render', 'slugify'],
	'./vite': ['skavex'],
	// The low-level entry: the whole pipeline minus anything touching the
	// filesystem, for a live preview, a worker or an edge runtime.
	'./browser': [
		'LAYOUT_IDENTIFIER',
		'buildModule',
		'createProcessor',
		'referencedComponents',
		'render',
		'selectUsedComponents'
	],
	// For assembling a pipeline by hand instead of using createProcessor.
	'./plugins': ['rehypeEscapeSvelteBraces', 'rehypeHeadings', 'remarkExtractFrontmatter'],
	// For writing a plugin: contributing metadata, injecting a component.
	'./utils': [
		'componentNode',
		'escapeTemplateLiteral',
		'getBareLinkFromParagraph',
		'rawHtmlExpression',
		'setMetadata'
	]
};

describe('the public API', () => {
	it('declares exactly the entry points the surface describes', () => {
		expect(Object.keys(entries).sort()).toEqual(Object.keys(SURFACE).sort());
	});

	// Driven by package.json rather than by SURFACE, so an entry point added to
	// the manifest and forgotten here fails rather than going unchecked.
	it.each(Object.entries(entries))(
		'%s exports exactly what it promises',
		async (entry, target) => {
			const expected = SURFACE[entry];
			expect(expected, `"${entry}" is published but not described in SURFACE`).toBeDefined();

			const module = await import(target.default.replace('./src/', '../src/'));
			expect(Object.keys(module).sort()).toEqual([...expected].sort());
		}
	);

	it.each(Object.entries(entries))('%s points at a module that exists', (_, target) => {
		// Manifest consistency, checked against the source tree rather than the
		// emitted one. The declaration files are generated, so asserting on them
		// here would make this suite depend on `pnpm build` having run — which is
		// how it broke the Pages job, whose only reason to run the tests is the
		// coverage badge. `scripts/check-exports.js` makes that assertion where
		// the artefacts actually are, as part of the build.
		expect(() => require.resolve(`../${target.default.replace('./', '')}`)).not.toThrow();
		expect(target.types).toBe(
			target.default.replace('./src/', './types/').replace(/\.js$/, '.d.ts')
		);
	});
});
