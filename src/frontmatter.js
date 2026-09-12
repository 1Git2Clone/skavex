import { visit } from 'unist-util-visit';
import { parse as parseYaml } from 'yaml';

/**
 * Remark plugin that lifts the YAML frontmatter block into `file.data.fm`.
 *
 * `remark-frontmatter` only teaches the parser to recognise the block; it does
 * not interpret it. This reads that node and merges the result into
 * `file.data.fm`, which is vfile's convention for a document's own data.
 *
 * Frontmatter is a contributor to that object, not the owner of it. Any plugin
 * may merge in its own keys the same way — spread what is there, add yours —
 * and every key ends up on the document's exported `metadata`. Merging rather
 * than assigning is the whole of the etiquette, and the reason for it is that
 * a plugin does not know what ran before it.
 *
 * The `yaml` node is left in the tree. `remark-rehype` has no handler for it,
 * so it is dropped on the way to HTML and never reaches the page.
 *
 * @returns {(tree: import('mdast').Root, file: import('vfile').VFile) => void} A
 *   unified transformer that writes the parsed frontmatter onto `file.data.fm`.
 */
export function remarkExtractFrontmatter() {
	return (tree, file) => {
		visit(tree, 'yaml', (node) => {
			const parsed = parseYaml(node.value);

			// An object, specifically. YAML happily parses a document that is a
			// list or a bare scalar, and `typeof [] === 'object'` — so without the
			// array check a frontmatter block of `- a` spreads into metadata as
			// `{0: 'a'}`, which is nobody's intent and hard to trace back.
			if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return;

			const existing = /** @type {Record<string, unknown>} */ (file.data.fm ?? {});
			file.data.fm = { ...existing, ...parsed };
		});
	};
}
