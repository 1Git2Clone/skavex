import { describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { skavex } from '../src/vite.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

/**
 * Call a plugin's `transform` the way Vite does.
 *
 * Vite binds a plugin context onto `this`, and this plugin uses `this.warn`.
 * Calling the hook as a plain function would throw before reaching anything
 * worth asserting.
 *
 * @param {any} plugin
 * @param {string} code
 * @param {string} id
 * @param {{warn?: (message: string) => void}} [context]
 * @returns {Promise<any>}
 */
function transform(plugin, code, id, context = {}) {
	return plugin.transform.call({ warn: context.warn ?? (() => {}) }, code, id);
}

describe('the Vite plugin', () => {
	it('runs before the Svelte plugin, which is what makes it work at all', () => {
		// Ordering, not trivia: this plugin turns markdown into Svelte source and
		// vite-plugin-svelte turns that into a component. The wrong way round and
		// the Svelte plugin never sees anything it recognises.
		expect(skavex().enforce).toBe('pre');
	});

	it('ignores files that are not documents', async () => {
		// Returning null rather than empty output is the contract: Vite passes the
		// file on to whichever plugin does own it.
		expect(await transform(skavex(), 'let x = 1;', '/src/app.js')).toBeNull();
	});

	it('compiles a document into Svelte source', async () => {
		const result = await transform(
			skavex(),
			'---\ntitle: Post\n---\n\n## Heading\n\n$x^2$\n',
			'/src/posts/a.md'
		);

		expect(result.code).toContain('export const metadata =');
		expect(result.code).toContain('"title":"Post"');
		expect(result.code).toContain('<h2 id="heading">');
		expect(result.code).toContain('katex');
	});

	it('emits no source map, deliberately', async () => {
		// The generated Svelte bears no line-for-line relation to the markdown, so
		// an inaccurate map would be worse than none.
		const result = await transform(skavex(), '# Title\n', '/src/a.md');
		expect(result.map).toBeNull();
	});

	it('matches on the path, not on the id Vite hands it', async () => {
		// Vite appends queries such as ?import. Matching the raw id would mean a
		// document silently passing through untransformed.
		const result = await transform(skavex(), '# Title\n', '/src/a.md?import');
		expect(result.code).toContain('<h1');
	});

	it('honours a custom extension list', async () => {
		const plugin = skavex({ extensions: ['.svx'] });

		expect(await transform(plugin, '# Title\n', '/src/a.md')).toBeNull();
		expect((await transform(plugin, '# Title\n', '/src/a.svx')).code).toContain('<h1');
	});

	it('warns once per duplicate basename, not once per document', async () => {
		// A rebuild recompiles every document that imports the directory. Warning
		// per document would bury the build log in one repeated line.
		const warn = vi.fn();
		const plugin = skavex({ components: './fixtures/dupes', root: ROOT });

		await transform(plugin, 'text\n', '/src/a.md', { warn });
		await transform(plugin, 'text\n', '/src/b.md', { warn });

		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn.mock.calls[0][0]).toMatch(/more than one component is named/);
	});

	it('resolves components against the root Vite reports', async () => {
		// configResolved is how the plugin learns where the project actually is;
		// without it a components directory would resolve against the cwd of
		// whatever process happened to start the build.
		const warn = vi.fn();
		const plugin = skavex({ components: './fixtures/dupes' });

		/** @type {any} */ (plugin).configResolved({ root: ROOT });
		await transform(plugin, 'text\n', '/src/a.md', { warn });

		expect(warn).toHaveBeenCalledTimes(1);
	});
});
