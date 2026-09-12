import { visit } from 'unist-util-visit';
import katex from 'katex';
import { slugify } from './slug.js';
import { setMetadata } from './utils.js';

/**
 * One heading, as a table of contents needs it.
 *
 * @typedef {object} HeadingEntry
 * @property {string} id    Fragment assigned to the heading, from {@link slugify}.
 * @property {number} level 1 for `h1` through 6 for `h6`.
 * @property {string} text  Flattened text. Maths appears as its LaTeX source.
 * @property {string} html  Rendered markup, maths included — what navigation should display.
 */

/**
 * Id for a heading whose text slugifies to nothing at all — `## 🎉`, `## ---`,
 * a heading that is only maths. An empty `id` attribute is invalid HTML and
 * gives a table of contents an href of `#`, which goes nowhere.
 */
const FALLBACK_ID = 'heading';

/** Every heading element, by tag name. */
const HEADINGS = { h1: 1, h2: 2, h3: 3, h4: 4, h5: 5, h6: 6 };

/**
 * Concatenate the text of a node's descendants.
 *
 * Deliberately not `hast-util-to-string`: this runs before KaTeX, when maths is
 * still a `<code class="math-inline">` holding its LaTeX source, and that source
 * is exactly what should reach the slug. Keeping the traversal here also keeps
 * the id derivation independent of a utility's version.
 *
 * @param {import('hast').Nodes} node The subtree to flatten.
 * @returns {string} Its text, with maths as its LaTeX source.
 */
function textOf(node) {
	if (node.type === 'text') return node.value;
	if (!('children' in node)) return '';
	return node.children.map(textOf).join('');
}

/**
 * Is this the element remark-math leaves behind for an inline formula?
 *
 * @param {import('hast').Nodes} node The node to test.
 * @returns {boolean} True for the `<code class="math-inline">` remark-math emits.
 */
function isInlineMath(node) {
	if (node.type !== 'element') return false;
	const className = node.properties.className;
	return Array.isArray(className) && className.includes('math-inline');
}

/**
 * Render a heading's children to display markup, rendering any maths.
 *
 * @param {import('hast').Nodes} node The heading, or one of its descendants.
 * @param {Record<string, unknown>} katexOptions The same options the body is
 *   rendered with, so a formula looks identical in navigation.
 * @returns {string} Display markup, maths already typeset.
 */
function htmlOf(node, katexOptions) {
	if (node.type === 'text') return node.value;

	if (isInlineMath(node)) {
		return katex.renderToString(textOf(node), { ...katexOptions, throwOnError: false });
	}

	if (!('children' in node)) return '';
	return node.children.map((child) => htmlOf(child, katexOptions)).join('');
}

/**
 * Rehype plugin that gives headings stable ids and collects them onto
 * `metadata.headings` for a table of contents.
 *
 * Opt in through `rehypePlugins` — skavex runs no metadata collector of its
 * own, and a table of contents is one thing a document tree can be asked for
 * among many:
 *
 * ```js
 * import { rehypeHeadings } from '@skavex/skavex/plugins';
 *
 * skavex({ rehypePlugins: [rehypeHeadings] })
 * ```
 *
 * It must run BEFORE KaTeX, and `rehypePlugins` is the stage that does.
 * Afterwards a heading containing maths has KaTeX's markup as its text
 * content, so an id derived then would be a slug of `<span class="katex">…`,
 * changing whenever KaTeX's output does. Running here means the id follows the
 * prose the author wrote.
 *
 * The `html` field carries the heading with its maths already typeset. Pass
 * `katexOptions` to match whatever was given to the `math` option, so a formula
 * looks the same in the navigation as it does in the text; the default renders
 * it the way KaTeX would out of the box, which is what the default `math`
 * option produces too.
 *
 * A heading that already has an id keeps it: an author who wrote one meant it,
 * and it may already be linked from elsewhere.
 *
 * Ids are unique within a document. A document that says `## Setup` twice gets
 * `setup` and `setup-1` rather than two elements sharing one id, which is
 * invalid HTML and sends every link to the second one to the first. The
 * collected entry carries the id that was actually assigned, so building
 * navigation from `metadata.headings` is always correct; calling `slugify`
 * again on the other side is not, for a document that repeats a heading.
 *
 * @param {object} [options] How much of the document to cover.
 * @param {number[]} [options.levels] Heading levels to process. Default: all six.
 * @param {Record<string, unknown>} [options.katexOptions] KaTeX options for `html`.
 * @returns {(tree: import('hast').Root, file: import('vfile').VFile) => void} A unified
 *   transformer that assigns ids and collects the entries onto `file.data.fm`.
 */
export function rehypeHeadings(options = {}) {
	const levels = options.levels ?? [1, 2, 3, 4, 5, 6];
	const katexOptions = options.katexOptions ?? {};

	return (tree, file) => {
		/** @type {HeadingEntry[]} */
		const headings = [];

		// Per document, never across documents: a build renders hundreds, and an
		// id suffixed because some earlier file used the same heading would be
		// both wrong and unreproducible from the document alone.
		/** @type {Set<string>} */
		const taken = new Set();

		// Every id already on the tree is reserved before a single one is
		// generated. Written ids are the ones that cannot move, so they cannot be
		// claimed first-come: a generated `setup` assigned to an earlier heading
		// would leave a later `<h2 id="setup">` duplicating it, which is the bug
		// this is all here to prevent.
		visit(tree, 'element', (node) => {
			const written = String(node.properties.id ?? '');
			if (written) taken.add(written);
		});

		/**
		 * The first id in the `base`, `base-1`, `base-2`… series still free.
		 *
		 * @param {string} base Preferred id.
		 * @returns {string} An id no other heading in this document holds.
		 */
		const unique = (base) => {
			let id = base;
			for (let n = 1; taken.has(id); n++) id = `${base}-${n}`;
			taken.add(id);
			return id;
		};

		visit(tree, 'element', (node) => {
			const level = HEADINGS[/** @type {keyof typeof HEADINGS} */ (node.tagName)];
			if (level === undefined || !levels.includes(level)) return;

			const text = textOf(node);
			const written = String(node.properties.id ?? '');

			// An author's own id is theirs and is never renamed; it may already be
			// linked from elsewhere. Generated ids move around it, in either
			// direction, because of the reservation pass above.
			const id = written || unique(slugify(text) || FALLBACK_ID);

			node.properties.id = id;
			headings.push({ id, level, text, html: htmlOf(node, katexOptions) });
		});

		setMetadata(file, { headings });
	};
}
