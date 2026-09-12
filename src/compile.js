import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkRehype from 'remark-rehype';
import rehypeKatex from 'rehype-katex';
import rehypeStringify from 'rehype-stringify';

import { remarkExtractFrontmatter } from './frontmatter.js';
import { rehypeEscapeSvelteBraces } from './escape.js';
import { findComponents, selectUsedComponents } from './components.js';

/**
 * Identifier the generated module binds the layout to. Reserved: a component
 * in the components directory with this name is ignored rather than imported
 * twice.
 */
const LAYOUT_IDENTIFIER = 'SkavexLayout';

/**
 * @typedef {Object} SkavexOptions
 * @property {string[]} [extensions]    File extensions treated as documents. Default `['.md']`.
 * @property {string} [layout]          Import specifier for a Svelte component wrapping every
 *                                      document. Receives the metadata as props; the document
 *                                      body is its `children`. Omit for no wrapper.
 * @property {string} [components]      Directory of `.svelte` files made available to markup by
 *                                      basename, so a plugin can emit `<YouTube />` without
 *                                      arranging its own import.
 * @property {string} [root]            Project root that `components` resolves against.
 *                                      Default `process.cwd()`; the Vite plugin supplies Vite's.
 * @property {boolean} [gfm]            GitHub Flavored Markdown: tables, strikethrough,
 *                                      task lists, autolinks. Default `true`.
 * @property {boolean|Record<string, unknown>} [math]
 *                                      LaTeX via remark-math + rehype-katex. Pass an object to
 *                                      override KaTeX options. Default `true`, which renders
 *                                      both HTML and MathML so the output is readable by
 *                                      assistive technology. Set `false` to order KaTeX
 *                                      yourself via `rehypePlugins`.
 * @property {import('unified').PluggableList} [remarkPlugins]
 *                                      Run after frontmatter, GFM and math; before conversion
 *                                      to HTML. Where document-level plugins belong.
 * @property {import('unified').PluggableList} [rehypePlugins]
 *                                      Run on the HTML tree BEFORE KaTeX, so a plugin reading
 *                                      heading text sees the prose rather than KaTeX's markup.
 */

/**
 * Default KaTeX options.
 *
 * `htmlAndMathml` is deliberate: HTML alone renders visually but exposes
 * nothing to a screen reader, so math-heavy prose becomes unreadable to anyone
 * using one. `strict: false` keeps a questionable construct from failing the
 * whole build.
 *
 * @type {Record<string, unknown>}
 */
const DEFAULT_KATEX_OPTIONS = { output: 'htmlAndMathml', strict: false };

/**
 * Build the unified processor for a set of options.
 *
 * Exposed so a consumer can render markdown to HTML without the Svelte module
 * around it — useful for tests, feeds and search indexes.
 *
 * @param {SkavexOptions} [options]
 * @returns {import('unified').Processor<any, any, any, any, string>} A processor
 *   whose `process` yields a string. The generics are loose on purpose: the
 *   chain is assembled conditionally, so its precise instantiation depends on
 *   which options were passed.
 */
export function createProcessor(options = {}) {
	const { gfm = true, math = true, remarkPlugins = [], rehypePlugins = [] } = options;

	const processor = unified()
		.use(remarkParse)
		.use(remarkFrontmatter, ['yaml'])
		.use(remarkExtractFrontmatter);

	if (gfm) processor.use(remarkGfm);
	if (math) processor.use(remarkMath);

	processor.use(remarkPlugins);

	// allowDangerousHtml keeps raw HTML — and any markup a plugin injected — as
	// `raw` nodes instead of discarding it. Without it, every component a plugin
	// emits would vanish between markdown and HTML.
	processor.use(remarkRehype, { allowDangerousHtml: true });

	processor.use(rehypePlugins);

	if (math) {
		const katexOptions =
			typeof math === 'object'
				? { ...DEFAULT_KATEX_OPTIONS, ...math }
				: DEFAULT_KATEX_OPTIONS;
		processor.use(rehypeKatex, katexOptions);
	}

	// After KaTeX: its MathML carries the original LaTeX in an <annotation>,
	// braces included, and that has to be escaped like any other text.
	processor.use(rehypeEscapeSvelteBraces);

	processor.use(rehypeStringify, { allowDangerousHtml: true });

	// The compiler tracks a processor's result type through a chain of `.use()`
	// expressions, not through separate statements — and the statements above are
	// conditional, so they cannot be a chain. It therefore still believes this
	// processor compiles to `undefined` when rehype-stringify has in fact made it
	// a string. The cast states what the assembled pipeline actually produces.
	return /** @type {import('unified').Processor<any, any, any, any, string>} */ (
		/** @type {unknown} */ (processor)
	);
}

/**
 * Render markdown to HTML and collect its metadata.
 *
 * @param {string} source Markdown, frontmatter included.
 * @param {SkavexOptions & {filename?: string}} [options]
 * @returns {Promise<{html: string, metadata: Record<string, unknown>}>}
 */
export async function render(source, options = {}) {
	const file = await createProcessor(options).process({
		value: source,
		path: options.filename
	});

	return {
		html: String(file),
		metadata: /** @type {Record<string, unknown>} */ (file.data.fm ?? {})
	};
}

/**
 * Serialise metadata for embedding in a `<script module>` block.
 *
 * `</script` inside a string literal would close the block early, so the slash
 * is escaped. The sequence is meaningless to JSON and to JavaScript, so the
 * parsed value is unchanged.
 *
 * @param {Record<string, unknown>} metadata
 * @returns {string} A JavaScript object literal.
 */
function serialiseMetadata(metadata) {
	return JSON.stringify(metadata ?? {}).replace(/<\/script/gi, '<\\/script');
}

/**
 * Assemble the Svelte component source for a rendered document.
 *
 * @param {Object} input
 * @param {string} input.html
 * @param {Record<string, unknown>} input.metadata
 * @param {string} [input.layout]
 * @param {import('./components.js').DiscoveredComponent[]} input.components
 * @returns {string} Svelte source, ready for the Svelte compiler.
 */
export function buildModule({ html, metadata, layout, components }) {
	/** @type {string[]} */
	const lines = [];

	lines.push('<script module>');
	lines.push(`\texport const metadata = ${serialiseMetadata(metadata)};`);
	lines.push('</script>');
	lines.push('');
	lines.push('<script>');

	if (layout) {
		lines.push(`\timport ${LAYOUT_IDENTIFIER} from ${JSON.stringify(layout)};`);
	}
	for (const component of components) {
		lines.push(`\timport ${component.name} from ${JSON.stringify(component.specifier)};`);
	}
	if (layout) {
		// Forwarded so a route can pass its own props through to the layout.
		lines.push('\tconst props = $props();');
	}

	lines.push('</script>');
	lines.push('');

	if (layout) {
		lines.push(`<${LAYOUT_IDENTIFIER} {...metadata} {...props}>`);
		lines.push(html);
		lines.push(`</${LAYOUT_IDENTIFIER}>`);
	} else {
		lines.push(html);
	}

	return lines.join('\n') + '\n';
}

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
