import { render, buildModule, LAYOUT_IDENTIFIER } from './browser.js';
import { findComponents, selectUsedComponents } from './components.js';

/** @typedef {import('./browser.js').SkavexOptions} SkavexOptions */
/** @typedef {import('./browser.js').DocumentMetadata} DocumentMetadata */

/**
 * Compile a markdown document into Svelte component source.
 *
 * The result is ordinary Svelte, so the Svelte compiler renders it on the
 * server like any other component — the document is HTML on first paint, with
 * no client-side markdown parsing and nothing to shift once hydration runs.
 *
 * @param {string} source Markdown, frontmatter included.
 * @param {SkavexOptions & {filename?: string}} [options] Pipeline options;
 *   `filename` is used for diagnostics only.
 * @returns {Promise<{code: string, metadata: DocumentMetadata, duplicates: string[]}>}
 *   The Svelte source, the document's metadata, and the basenames of any
 *   components that collided so the caller can warn about them.
 */
export async function compile(source, options = {}) {
	const { html, metadata } = await render(source, options);

	/** @type {import('./components.js').DiscoveredComponent[]} */
	let components = [];
	/** @type {string[]} */
	let duplicates = [];

	if (options.components) {
		const found = await findComponents(options.components, options.root ?? process.cwd());
		duplicates = found.duplicates;
		components = selectUsedComponents(html, found.components).filter(
			(component) => component.name !== LAYOUT_IDENTIFIER
		);
	}

	const code = buildModule({ html, metadata, layout: options.layout, components });

	return { code, metadata, duplicates };
}
