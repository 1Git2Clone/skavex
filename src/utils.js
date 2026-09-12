/**
 * Helpers for writing plugins that inject Svelte markup.
 *
 * Nothing here is required to use skavex. They exist because every plugin that
 * emits a component re-derives the same two things — how to escape a template
 * literal, and how to recognise a paragraph that is nothing but a link — and
 * getting either subtly wrong produces markup that fails to compile.
 */

/**
 * Escape a string for inclusion in a JavaScript template literal.
 *
 * A backtick would end the literal and `${` would open an interpolation, so
 * pre-rendered HTML containing either — highlighted code especially — corrupts
 * the surrounding expression without this.
 *
 * @param {string} value
 * @returns {string}
 */
export function escapeTemplateLiteral(value) {
	return value.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
}

/**
 * Build a `{@html ...}` expression carrying pre-rendered HTML.
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
 * @param {string} name
 * @param {unknown} value
 * @returns {string}
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
 * @param {any} node An mdast node; only `paragraph` can match.
 * @returns {string|null}
 */
export function getBareLinkFromParagraph(node) {
	if (!node || node.type !== 'paragraph') return null;
	if (!Array.isArray(node.children) || node.children.length !== 1) return null;

	const child = node.children[0];
	if (child.type !== 'link') return null;
	if (!Array.isArray(child.children) || child.children.length !== 1) return null;

	const text = child.children[0];
	if (text.type !== 'text') return null;
	if (text.value.trim() !== String(child.url).trim()) return null;

	return child.url;
}
