import { describe, expect, it } from 'vitest';
import { build } from 'vite';
import { render } from '../src/browser.js';

/**
 * Bundle an entry the way a browser app would and hand back the code.
 *
 * A node builtin does not fail this build. Vite replaces it with a stub named
 * `__vite_browser_external` whose every property access throws, so the breakage
 * is deferred to runtime in the consumer's browser — which is precisely why it
 * needs a test rather than a build step to catch.
 *
 * @param {string} entry
 * @returns {Promise<string>}
 */
async function bundleForBrowser(entry) {
	const result = /** @type {any} */ (
		await build({
			logLevel: 'silent',
			configFile: false,
			build: {
				write: false,
				minify: false,
				lib: { entry, formats: ['es'], fileName: 'out' }
			}
		})
	);

	return result[0].output.map((/** @type {any} */ chunk) => chunk.code ?? '').join('\n');
}

describe('@skavex/skavex/browser', () => {
	it('bundles for a browser with nothing stubbed out', async () => {
		// Checked by bundling rather than by reading imports: a hand-written
		// import walk would only cover skavex's own files and would miss a
		// dependency that reaches for node:path three levels down.
		const code = await bundleForBrowser('src/browser.js');

		expect(code).not.toContain('__vite_browser_external');
	}, 60_000);

	it('and the main entry does not — which is why this subpath exists', async () => {
		// The positive control. Without it the test above passes just as happily
		// when the bundler stops reporting stubs at all, and the guarantee
		// quietly becomes unchecked. src/index.js reaches components.js for
		// `options.components`, which reads the filesystem: correct for a build
		// tool, fatal in a browser.
		const code = await bundleForBrowser('src/index.js');

		expect(code).toContain('__vite_browser_external');
	}, 60_000);

	it('renders markdown, maths included, through the browser entry', async () => {
		// Bundling cleanly is not enough — the entry has to actually be the library.
		const { html, metadata } = await render('## Heading\n\nInline $O(n)$ math.');

		expect(html).toContain('katex-mathml');
		expect(html).toContain('<h2 id="heading">');
		expect(/** @type {any[]} */ (metadata.headings)).toHaveLength(1);
	});
});
