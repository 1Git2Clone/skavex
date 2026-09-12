/**
 * The half of skavex that runs anywhere.
 *
 * Markdown to HTML, and HTML to Svelte component source: both are pure
 * string work, so nothing reachable from this module imports a node builtin
 * and it bundles for a browser as-is — a live preview pane, a client-side
 * search index, a worker. `@skavex/skavex` itself cannot promise that,
 * because `compile` discovers components by reading the filesystem.
 *
 * test/browser.test.js bundles this module with Vite and fails if anything in
 * its graph gets stubbed out, so the guarantee is checked rather than claimed.
 *
 * @module
 */

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

/**
 * A Svelte component discovered in the components directory.
 *
 * @typedef {object} DiscoveredComponent
 * @property {string} name       Tag name as markup must spell it, e.g. `YouTube`.
 * @property {string} specifier  Import specifier to emit, e.g. `/src/lib/md/YouTube.svelte`.
 */

/**
 * @typedef {object} SkavexOptions
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
 *                                      element text sees the prose rather than KaTeX's markup.
 *                                      Where `rehype-slug`, a table-of-contents collector and
 *                                      anything else derived from the document belongs.
 */

/**
 * A document's metadata: its frontmatter, plus whatever plugins contributed.
 *
 * Deliberately open and deliberately unopinionated. skavex writes nothing here
 * but the document's own frontmatter — a document tree can be asked for a table
 * of contents, a reading time, its outbound links, the languages of its code
 * blocks, a word count, and none of that is skavex's to decide or to implement.
 * Remark and rehype exist for it. A plugin merges what a project actually needs
 * into `file.data.fm` — vfile's convention, not an API of skavex's — and all of
 * it is exported as the document's `metadata`.
 *
 * The consequence is that values arrive typed `unknown`, because only the
 * project knows what its own pipeline produces. Narrow it where you consume it:
 *
 * ```ts
 * const headings = metadata.headings as TocEntry[] | undefined;
 * ```
 *
 * @typedef {Record<string, unknown>} DocumentMetadata
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

/** Whether the removed-option warning has already been printed. */
let warnedAboutHeadings = false;

/**
 * Warn once if a caller still passes the `headings` option removed in 0.4.0.
 *
 * An unknown option is otherwise ignored in silence, and the symptom — a table
 * of contents that is suddenly empty and headings that have lost their ids — is
 * a long way from the cause. TypeScript callers get an excess-property error for
 * free; this is for everyone else.
 *
 * The replacement is not another skavex option. Heading ids are `rehype-slug`,
 * a table of contents is a plugin over the same tree, and both are ordinary
 * rehype plugins that belong in `rehypePlugins`.
 *
 * Once per process rather than once per document, because a site has hundreds
 * and the second line of it teaches nobody anything. Remove in 0.5.0.
 *
 * @param {SkavexOptions} options The options as given.
 * @returns {void}
 */
function warnAboutRemovedHeadingsOption(options) {
	if (warnedAboutHeadings || !('headings' in options)) return;
	warnedAboutHeadings = true;

	console.warn(
		'[skavex] The `headings` option was removed in 0.4.0 and is being ignored. ' +
			'Heading ids and a table of contents are rehype plugins, not skavex ' +
			'features:\n' +
			"  import rehypeSlug from 'rehype-slug';\n" +
			'  skavex({ rehypePlugins: [rehypeSlug] })'
	);
}

/**
 * Build the unified processor for a set of options.
 *
 * Exposed so a consumer can render markdown to HTML without the Svelte module
 * around it — useful for tests, feeds and search indexes.
 *
 * Written as one chain, with every optional stage becoming an empty
 * `PluggableList` when it is off. unified treats that as a no-op, and keeping
 * the chain unbroken is what lets the compiler follow the tree types all the
 * way from mdast through hast to the string rehype-stringify produces. Split
 * into conditional statements it cannot, and the return type collapses.
 *
 * @param {SkavexOptions} [options] Which stages to include and how to configure them.
 * @returns {import('unified').Processor<import('mdast').Root, import('mdast').Root, import('hast').Root, import('hast').Root, string>}
 *   A processor whose `process` yields the rendered HTML.
 */
export function createProcessor(options = {}) {
	const { gfm = true, math = true, remarkPlugins = [], rehypePlugins = [] } = options;

	warnAboutRemovedHeadingsOption(options);

	const katexOptions =
		typeof math === 'object' ? { ...DEFAULT_KATEX_OPTIONS, ...math } : DEFAULT_KATEX_OPTIONS;

	return (
		unified()
			.use(remarkParse)
			.use(remarkFrontmatter, ['yaml'])
			.use(remarkExtractFrontmatter)
			.use(gfm ? [remarkGfm] : [])
			.use(math ? [remarkMath] : [])
			.use(remarkPlugins)
			// allowDangerousHtml keeps raw HTML — and any markup a plugin injected —
			// as `raw` nodes instead of discarding it. Without it, every component a
			// plugin emits would vanish between markdown and HTML.
			.use(remarkRehype, { allowDangerousHtml: true })
			// Before KaTeX, so a plugin reading an element's text sees the prose the
			// author wrote rather than KaTeX's markup. That ordering is the reason
			// this stage exists where it does; see src/plugins.js.
			.use(rehypePlugins)
			.use(math ? [[rehypeKatex, katexOptions]] : [])
			// After KaTeX: its MathML carries the original LaTeX in an <annotation>,
			// braces included, and that has to be escaped like any other text.
			.use(rehypeEscapeSvelteBraces)
			.use(rehypeStringify, { allowDangerousHtml: true })
	);
}

/**
 * Render markdown to HTML and collect its metadata.
 *
 * @param {string} source Markdown, frontmatter included.
 * @param {SkavexOptions & {filename?: string}} [options] Pipeline options;
 *   `filename` is used for diagnostics only.
 * @returns {Promise<{html: string, metadata: DocumentMetadata}>} The rendered
 *   HTML and the document's metadata.
 */
export async function render(source, options = {}) {
	const file = await createProcessor(options).process({
		value: source,
		path: options.filename
	});

	return {
		html: String(file),
		metadata: /** @type {DocumentMetadata} */ (file.data.fm ?? {})
	};
}

/**
 * Identifier the generated module binds the layout to. Reserved: a component
 * in the components directory with this name is ignored rather than imported
 * twice.
 */
export const LAYOUT_IDENTIFIER = 'SkavexLayout';

/**
 * Serialise metadata for embedding in a `<script module>` block.
 *
 * `</script` inside a string literal would close the block early, so the slash
 * is escaped. The sequence is meaningless to JSON and to JavaScript, so the
 * parsed value is unchanged.
 *
 * @param {DocumentMetadata} metadata The document's metadata.
 * @returns {string} A JavaScript object literal.
 */
function serialiseMetadata(metadata) {
	return JSON.stringify(metadata ?? {}).replace(/<\/script/gi, '<\\/script');
}

/**
 * Assemble the Svelte component source for a rendered document.
 *
 * @param {object} input The rendered document and what to wrap it in.
 * @param {string} input.html The document body, already HTML.
 * @param {DocumentMetadata} input.metadata Exported from the generated module.
 * @param {string} [input.layout] Import specifier for a wrapping component.
 * @param {DiscoveredComponent[]} input.components Components
 *   the markup refers to, which the module must import.
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
 * Every component name a document's markup references.
 *
 * Only capitalised tags can be components in Svelte, and by the time this runs
 * any `<` that was literal document text has already been escaped to `&lt;` by
 * {@link import('./escape.js').rehypeEscapeSvelteBraces}. So a bare `<Name` in
 * the HTML is markup a plugin injected on purpose, never prose or a fenced code
 * sample that merely looks like one.
 *
 * @param {string} html Stringified document markup.
 * @returns {string[]} The names referenced, deduplicated, in first-seen order.
 */
export function referencedComponents(html) {
	/** @type {Set<string>} */
	const used = new Set();
	for (const match of html.matchAll(/<([A-Z][A-Za-z0-9_]*)/g)) used.add(match[1]);
	return [...used];
}

/**
 * Select the components a document actually references.
 *
 * The list of candidates can come from anywhere — a directory scan, or an
 * in-memory workspace like the live editor's.
 *
 * A referenced name with no matching candidate is simply not returned: this
 * function reports what can be imported, not what is missing. Callers that
 * care about the difference compare against {@link referencedComponents}.
 *
 * @param {string} html Stringified document markup.
 * @param {DiscoveredComponent[]} available Components available to the document.
 * @returns {DiscoveredComponent[]} Those referenced by `html`, deduplicated.
 */
export function selectUsedComponents(html, available) {
	const used = new Set(referencedComponents(html));
	return available.filter((component) => used.has(component.name));
}
