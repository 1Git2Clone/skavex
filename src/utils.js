/**
 * Helpers for writing plugins.
 *
 * Nothing here is required to use skavex. They exist because every plugin
 * re-derives the same few things — how a plugin contributes metadata, how to
 * escape a template literal, how to recognise a paragraph that is nothing but a
 * link — and getting any of them subtly wrong produces markup that fails to
 * compile, or metadata that silently replaces somebody else's.
 */

/**
 * Contribute keys to a document's metadata.
 *
 * This is the whole of skavex's metadata contract: metadata is an open object,
 * anything may write to it, and what a document exports as `metadata` is
 * whatever the pipeline left there. Frontmatter is one contributor and has no
 * special standing; a plugin adding a reading time, a table of contents, the
 * outbound links, the languages of the code blocks — or anything else the tree
 * can be asked for — is another.
 *
 * Merges rather than assigns, because a plugin does not know what ran before
 * it. Writing `file.data.fm = {...}` directly is the same operation minus that
 * guarantee, and discards frontmatter whenever it runs second.
 *
 * ```js
 * export function remarkReadingTime() {
 *   return (tree, file) => {
 *     const words = toString(tree).split(/\s+/).length;
 *     setMetadata(file, { readingTime: Math.ceil(words / 200) });
 *   };
 * }
 * ```
 *
 * @param {import('vfile').VFile} file The file being processed.
 * @param {Record<string, unknown>} values Keys to merge in. Later writes to the
 *   same key win, so a plugin that must not override an author's frontmatter
 *   should check `file.data.fm` first.
 * @returns {void}
 */
export function setMetadata(file, values) {
	const existing = /** @type {Record<string, unknown>} */ (file.data.fm ?? {});
	file.data.fm = { ...existing, ...values };
}

/**
 * Escape a string for inclusion in a JavaScript template literal.
 *
 * A backtick would end the literal and `${` would open an interpolation, so
 * pre-rendered HTML containing either — highlighted code especially — corrupts
 * the surrounding expression without this.
 *
 * @param {string} value Text destined for inside a template literal.
 * @returns {string} The same text, safe to interpolate.
 */
export function escapeTemplateLiteral(value) {
	return value.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
}

/**
 * Build a Svelte html-expression carrying pre-rendered HTML.
 *
 * Use when a plugin has already produced trusted markup — syntax-highlighted
 * code, a rendered diagram — and wants a component to display it verbatim.
 *
 * @param {string} html Trusted HTML. Never pass unsanitised user input.
 * @returns {string} A Svelte expression.
 */
export function rawHtmlExpression(html) {
	return `{@html \`${escapeTemplateLiteral(html)}\`}`;
}

/**
 * Serialise a value as a Svelte attribute.
 *
 * Strings become quoted attributes and everything else an expression, so
 * `{id: 'x', start: 30, loop: true}` yields `id="x" start={30} loop={true}`.
 *
 * @param {string} name Attribute name, written as the tag should carry it.
 * @param {unknown} value Attribute value. Strings are quoted; anything else
 *   becomes a Svelte expression.
 * @returns {string} One `name="…"` or `name={…}` pair, or an empty string when
 *   the value is `undefined`.
 */
function attribute(name, value) {
	if (typeof value === 'string') return `${name}=${JSON.stringify(value)}`;
	return `${name}={${JSON.stringify(value)}}`;
}

/**
 * Build an mdast `html` node holding a Svelte component tag.
 *
 * An `html` node survives the conversion to HTML as a `raw` node, which the
 * brace escaper leaves alone — so the component reaches the Svelte compiler
 * intact. Replace a node with this to turn markdown into a component:
 *
 * ```js
 * visit(tree, 'code', (node, index, parent) => {
 *   parent.children[index] = componentNode('CodeBlock', { lang: node.lang },
 *     rawHtmlExpression(highlight(node.value)));
 * });
 * ```
 *
 * The component must be resolvable — in the configured `components` directory,
 * or imported by some other plugin.
 *
 * @param {string} name Component name, capitalised as the tag must appear.
 * @param {Record<string, unknown>} [props] Attributes; `undefined` values are omitted.
 * @param {string} [children] Raw Svelte markup for the body. Self-closing when absent.
 * @returns {{type: 'html', value: string}} An mdast node.
 */
export function componentNode(name, props = {}, children) {
	const attributes = Object.entries(props)
		.filter(([, value]) => value !== undefined)
		.map(([key, value]) => attribute(key, value))
		.join(' ');

	const open = attributes ? `<${name} ${attributes}` : `<${name}`;

	return {
		type: 'html',
		value: children === undefined ? `${open} />` : `${open}>${children}</${name}>`
	};
}

/**
 * Return the URL when a paragraph is a single bare link, else `null`.
 *
 * This is the shape markdown gives `https://example.com` on its own line, and
 * the usual trigger for turning a URL into an embed. A paragraph with a link
 * plus surrounding prose, or a link whose text differs from its target, is
 * deliberately not a match — the author wrote a sentence, not an embed.
 *
 * @param {import('mdast').Nodes | null | undefined} node Any mdast node; only a
 *   `paragraph` can match.
 * @returns {string|null} The URL, or `null` when the paragraph is anything else.
 */
export function getBareLinkFromParagraph(node) {
	// The Array.isArray guards are redundant for a caller the types reach — an
	// mdast paragraph always has children. They are here because this is
	// exported for plugin authors, and a plain-JavaScript one can pass anything
	// at all. Returning null beats throwing inside somebody else's build.
	if (!node || node.type !== 'paragraph') return null;
	if (!Array.isArray(node.children) || node.children.length !== 1) return null;

	const child = node.children[0];
	if (child.type !== 'link') return null;
	if (!Array.isArray(child.children) || child.children.length !== 1) return null;

	const text = child.children[0];
	if (text.type !== 'text') return null;
	if (String(text.value).trim() !== String(child.url).trim()) return null;

	return child.url;
}
