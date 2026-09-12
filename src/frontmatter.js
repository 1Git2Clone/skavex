import { visit } from 'unist-util-visit';
import { parse as parseYaml } from 'yaml';

/**
 * Remark plugin that lifts the YAML frontmatter block into `file.data.fm`.
 *
 * `remark-frontmatter` only teaches the parser to recognise the block; it does
 * not interpret it. This reads that node and merges the result into
 * `file.data.fm`, which is the convention the rest of the pipeline uses:
 * any downstream plugin may add to the same object (a table of contents,
 * a reading time) and every key ends up on the document's exported metadata.
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
			if (parsed === null || typeof parsed !== 'object') return;

			const existing = /** @type {Record<string, unknown>} */ (file.data.fm ?? {});
			file.data.fm = { ...existing, ...parsed };
		});
	};
}
