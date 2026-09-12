import { compile } from './compile.js';

/**
 * Vite plugin that compiles markdown documents into Svelte components.
 *
 * It runs `enforce: 'pre'` so it transforms the file before
 * `@sveltejs/vite-plugin-svelte` sees it: this plugin turns markdown into
 * Svelte source, and the Svelte plugin turns that into a component. Both must
 * agree on which extensions are documents, so the same list goes in
 * `svelte.config.js`:
 *
 * ```js
 * // vite.config.js
 * import { skavex } from '@skavex/skavex/vite';
 * import { sveltekit } from '@sveltejs/kit/vite';
 *
 * export default {
 *   plugins: [skavex({ layout: '/src/lib/Layout.svelte' }), sveltekit()]
 * };
 * ```
 *
 * ```js
 * // svelte.config.js
 * export default { extensions: ['.svelte', '.md'] };
 * ```
 *
 * Leaving `.md` out of `extensions` is the one failure worth knowing in
 * advance: this plugin emits valid Svelte, the Svelte plugin ignores it for not
 * being a Svelte file, and the browser is served component source as if it were
 * a module.
 *
 * @param {import('./compile.js').SkavexOptions} [options]
 * @returns {import('vite').Plugin}
 */
export function skavex(options = {}) {
	const extensions = options.extensions ?? ['.md'];

	/** @type {string | undefined} */
	let root;

	/** @type {Set<string>} */
	const warnedDuplicates = new Set();

	return {
		name: 'skavex',
		enforce: 'pre',

		configResolved(config) {
			root = config.root;
		},

		async transform(code, id) {
			// Vite appends queries such as `?raw` or `?import`; match on the path.
			const filename = id.split('?')[0];
			if (!extensions.some((extension) => filename.endsWith(extension))) return null;

			const result = await compile(code, {
				...options,
				root: options.root ?? root ?? process.cwd(),
				filename
			});

			// Two components sharing a basename cannot both be addressed by tag, so
			// one of them is silently unreachable. Warned once per name per process
			// rather than once per document that happens to be rebuilt.
			for (const name of result.duplicates) {
				if (warnedDuplicates.has(name)) continue;
				warnedDuplicates.add(name);
				this.warn(
					`skavex: more than one component is named "${name}" in "${options.components}". ` +
						`Markup can only reach the first; rename one of them.`
				);
			}

			// No source map: the generated Svelte bears no line-for-line relation to
			// the markdown, so an inaccurate map would be worse than none. The Svelte
			// compiler still maps its own output back to this source.
			return { code: result.code, map: null };
		}
	};
}
