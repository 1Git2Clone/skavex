import { render, buildModule, LAYOUT_IDENTIFIER } from './browser.js';
import { findComponents, selectUsedComponents } from './components.js';

/** @typedef {import('./browser.js').SkavexOptions} SkavexOptions */

/**
 * Compile a markdown document into Svelte component source.
 *
 * The result is ordinary Svelte, so the Svelte compiler renders it on the
 * server like any other component — the document is HTML on first paint, with
 * no client-side markdown parsing and nothing to shift once hydration runs.
 *
 * @param {string} source Markdown, frontmatter included.
 * @param {SkavexOptions & {filename?: string}} [options]
 * @returns {Promise<{code: string, metadata: Record<string, unknown>, duplicates: string[]}>}
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
