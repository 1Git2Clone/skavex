import { describe, expect, it } from 'vitest';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { escapeTemplateLiteral, getBareLinkFromParagraph } from '../src/utils.js';

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
 * @returns {any[]}
 */
function parse(source) {
	const processor = unified().use(remarkParse).use(remarkGfm);
	return /** @type {any} */ (processor.runSync(processor.parse(source))).children;
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
		expect(getBareLinkFromParagraph({ type: 'paragraph' })).toBeNull();
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
