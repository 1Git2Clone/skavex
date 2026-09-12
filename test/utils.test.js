import { describe, expect, it } from 'vitest';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { escapeTemplateLiteral, getBareLinkFromParagraph, setMetadata } from '../src/utils.js';
import { render } from '../src/index.js';
import { VFile } from 'vfile';

/**
 * Parse markdown the way skavex does and hand back the top-level nodes.
 *
 * Built from a real parse rather than hand-written mdast: the helper exists to
 * recognise a shape remark produces, so a literal that drifted from what remark
 * actually emits would test nothing. GFM is part of that shape — a bare URL is
 * only a link node once autolink-literal is on, which is why skavex enables gfm
 * by default and why a plugin using this helper needs it too.
 *
 * @param {string} source
 * @returns {import('mdast').RootContent[]}
 */
function parse(source) {
	const processor = unified().use(remarkParse).use(remarkGfm);
	// runSync is typed to return the generic `Node`; this pipeline is parse plus
	// GFM, so what comes back really is an mdast root. A named type, not `any`.
	const tree = /** @type {import('mdast').Root} */ (processor.runSync(processor.parse(source)));
	return tree.children;
}

describe('getBareLinkFromParagraph', () => {
	it('matches a URL alone on its line — the shape an embed plugin looks for', () => {
		const [node] = parse('https://example.com/watch\n');
		expect(getBareLinkFromParagraph(node)).toBe('https://example.com/watch');
	});

	it('refuses a link with prose around it', () => {
		// The author wrote a sentence, not an embed. Replacing this with a video
		// player would delete their words.
		const [node] = parse('See https://example.com/watch for details.\n');
		expect(getBareLinkFromParagraph(node)).toBeNull();
	});

	it('refuses a link whose text differs from its target', () => {
		const [node] = parse('[the recording](https://example.com/watch)\n');
		expect(getBareLinkFromParagraph(node)).toBeNull();
	});

	it('refuses anything that is not a paragraph', () => {
		const [heading] = parse('## https://example.com\n');
		expect(getBareLinkFromParagraph(heading)).toBeNull();
		expect(getBareLinkFromParagraph(null)).toBeNull();
		// Deliberately malformed: a paragraph with no children cannot come out of
		// remark, but an untyped JavaScript caller can construct one, and the
		// function promises to return null rather than throw inside their build.
		const childless = /** @type {import('mdast').Nodes} */ (
			/** @type {unknown} */ ({ type: 'paragraph' })
		);
		expect(getBareLinkFromParagraph(childless)).toBeNull();
	});
});

describe('escapeTemplateLiteral', () => {
	it('neutralises the three sequences that would break out of a template', () => {
		// A component prop is emitted inside a template literal, so a value
		// carrying any of these would end the literal and inject code.
		const escaped = escapeTemplateLiteral('a ` b ${c} d \\ e');

		expect(escaped).not.toMatch(/(^|[^\\])`/);
		expect(escaped).not.toMatch(/(^|[^\\])\$\{/);
		expect(eval('`' + escaped + '`')).toBe('a ` b ${c} d \\ e');
	});
});

describe('setMetadata', () => {
	it('merges rather than assigns, so a plugin cannot erase what ran before it', () => {
		const file = new VFile();
		file.data.fm = { title: 'Post' };

		setMetadata(file, { readingTime: 4 });

		expect(file.data.fm).toEqual({ title: 'Post', readingTime: 4 });
	});

	it('works on a file nothing has written to yet', () => {
		const file = new VFile();

		setMetadata(file, { tags: ['a'] });

		expect(file.data.fm).toEqual({ tags: ['a'] });
	});

	it("is all a plugin needs to put anything on a document's metadata", async () => {
		// The generic mechanism, end to end: skavex names no metadata key of its
		// own, and whatever a plugin contributes here is what the document exports.
		/** @returns {(tree: import('mdast').Root, file: import('vfile').VFile) => void} */
		const remarkStats = () => (tree, file) => {
			setMetadata(file, {
				paragraphs: tree.children.filter((n) => n.type === 'paragraph').length
			});
		};

		const { metadata } = await render('---\ntitle: Post\n---\n\none\n\ntwo\n', {
			remarkPlugins: [remarkStats]
		});

		expect(metadata).toEqual({ title: 'Post', paragraphs: 2 });
	});
});
