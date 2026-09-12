import { visit } from 'unist-util-visit';

/**
 * Escape a run of literal document text so the Svelte compiler treats it as
 * text rather than as markup or an expression.
 *
 * Order matters. `&` is escaped first, otherwise the ampersands introduced by
 * the later replacements would themselves be escaped and the reader would see
 * a literal `&#123;` on the page.
 *
 * @param {string} value Raw text content.
 * @returns {string} HTML-safe text in which `{` and `}` are character references.
 */
export function escapeText(value) {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/\{/g, '&#123;')
		.replace(/\}/g, '&#125;');
}

/**
 * Rehype plugin that makes prose safe to hand to the Svelte compiler.
 *
 * Svelte reads `{...}` in markup as an expression, so a post containing prose
 * like `{arr[i]}`, an inline code span with braces, or KaTeX's MathML
 * `<annotation>` (which embeds the original LaTeX, braces and all) would fail
 * to compile or silently evaluate as code.
 *
 * Only `text` nodes are rewritten. A `raw` node is markup a plugin injected on
 * purpose — a Svelte component, an expression, a block — and rewriting it would
 * defeat the reason the plugin produced it. That split is the whole contract:
 *
 * - `text` -> literal document content -> escaped
 * - `raw`  -> deliberate markup       -> untouched
 *
 * The replacement is a `raw` node rather than an edited `text` node because
 * `rehype-stringify` escapes text on the way out, which would double-escape the
 * character references into `&#x26;#123;`.
 *
 * Must run AFTER any plugin that produces text containing braces (notably
 * `rehype-katex`) and requires `allowDangerousHtml` on `rehype-stringify`, or
 * the `raw` nodes are dropped.
 *
 * @returns {(tree: import('hast').Root) => void} A unified transformer.
 */
export function rehypeEscapeSvelteBraces() {
	return (tree) => {
		visit(tree, 'text', (node, index, parent) => {
			if (parent === undefined || index === undefined) return;
			if (!/[{}]/.test(node.value)) return;

			// `raw` is declared by mdast-util-to-hast, which augments hast's node
			// unions — so this is a named type rather than a shape asserted past
			// the compiler.
			/** @type {import('hast').RootContent} */
			const raw = { type: 'raw', value: escapeText(node.value) };
			parent.children[index] = raw;
		});
	};
}
