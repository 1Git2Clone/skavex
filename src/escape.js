import { visit } from 'unist-util-visit';
import { toHtml } from 'hast-util-to-html';

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
	return escapeBraces(value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
}

/**
 * Replace braces with character references, leaving everything else alone.
 *
 * Used on its own for markup that is already escaped — a serialised tag, where
 * `&`, `<` and `>` have had their treatment from the serialiser and doing it
 * again would put `&#x26;` on the page.
 *
 * @param {string} value Text or markup containing braces.
 * @returns {string} The same, with `{` and `}` as character references.
 */
function escapeBraces(value) {
	return value.replace(/\{/g, '&#123;').replace(/\}/g, '&#125;');
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
 * Attribute values need the same treatment and cannot get it the same way.
 * Svelte reads `title="a {b} c"` as an interpolated attribute, so a markdown
 * image whose alt text or title contains braces loses it — quietly, because an
 * expression over an undefined variable renders as nothing rather than
 * failing. Putting a character reference in the property does not work either:
 * `hast-util-to-html` escapes `&` in an attribute value, turning `&#123;` into
 * `&#x26;#123;` on the page. So an element carrying a braced attribute has its
 * tags serialised here and handed on as `raw`, which nothing escapes again.
 * Its children stay real nodes, and the text pass below still reaches them.
 *
 * Must run AFTER any plugin that produces text containing braces (notably
 * `rehype-katex`) and requires `allowDangerousHtml` on `rehype-stringify`, or
 * the `raw` nodes are dropped.
 *
 * @returns {(tree: import('hast').Root) => void} A unified transformer.
 */
export function rehypeEscapeSvelteBraces() {
	return (tree) => {
		// One traversal for both jobs. A maths-heavy document is tens of thousands
		// of nodes once KaTeX has run — it emits a span per glyph — so a second
		// pass over the tree is a measurable share of the build rather than a
		// rounding error.
		visit(tree, (node, index, parent) => {
			if (parent === undefined || index === undefined) return;

			if (node.type === 'text') {
				if (!hasBrace(node.value)) return;

				// `raw` is declared by mdast-util-to-hast, which augments hast's node
				// unions — so this is a named type rather than a shape asserted past
				// the compiler.
				/** @type {import('hast').RootContent} */
				const raw = { type: 'raw', value: escapeText(node.value) };
				parent.children[index] = raw;
				return;
			}

			if (node.type !== 'element' || !hasBracedProperty(node)) return;

			// Serialised with its children removed, so the result is just the tags:
			// `<a title="…"></a>`, or `<img alt="…">` for a void element. Doing it
			// this way rather than assembling the tag by hand keeps every rule about
			// class lists, boolean attributes and quoting where it already works.
			const shell = toHtml({ ...node, children: [] }, { allowDangerousHtml: true });
			const close = `</${node.tagName}>`;
			const paired = shell.endsWith(close);

			/** @type {import('hast').RootContent[]} */
			const replacement = [
				{
					type: 'raw',
					value: escapeBraces(paired ? shell.slice(0, -close.length) : shell)
				},
				...node.children
			];
			if (paired) replacement.push({ type: 'raw', value: close });

			parent.children.splice(index, 1, ...replacement);

			// Continue from the replacement rather than past it: the children are
			// siblings now, and they have not been visited yet.
			return index;
		});
	};
}

/**
 * Does this string contain a brace?
 *
 * `indexOf` rather than a regular expression, and two of them rather than a
 * character class, because this runs once per text node and once per attribute
 * value in the document — which on a page of maths is a five-figure number.
 *
 * @param {string} value Any string.
 * @returns {boolean} True if it contains `{` or `}`.
 */
function hasBrace(value) {
	return value.indexOf('{') !== -1 || value.indexOf('}') !== -1;
}

/**
 * Does any attribute of this element carry a brace?
 *
 * Iterated with `for...in` rather than `Object.values`, which would allocate an
 * array for every element in the document to look at — usually to find a class
 * list and a style, neither of which has ever contained a brace.
 *
 * @param {import('hast').Element} node The element to check.
 * @returns {boolean} True if some attribute value is a string containing a brace.
 */
function hasBracedProperty(node) {
	for (const key in node.properties) {
		const value = node.properties[key];
		if (typeof value === 'string' && hasBrace(value)) return true;
	}
	return false;
}
