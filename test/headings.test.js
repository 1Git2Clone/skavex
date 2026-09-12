import { describe, expect, it } from 'vitest';
import { render, slugify } from '../src/index.js';

const DOC = `
## Dictionary

text

### $O(\\log n)$ - Logarithmic Complexity

text

## Complexity Table
`;

/**
 * The collected headings, refusing to continue if there are none.
 *
 * Every test below is about what the entries contain, so a run where the
 * feature produced nothing should fail here with that sentence rather than
 * further down with "cannot read properties of undefined".
 *
 * @param {import('../src/browser.js').DocumentMetadata} metadata
 * @returns {import('../src/headings.js').HeadingEntry[]}
 */
function headingsOf(metadata) {
	if (!metadata.headings) throw new Error('no headings were collected');
	return metadata.headings;
}

describe('slugify', () => {
	it('lowercases, hyphenates and drops unsafe characters', () => {
		expect(slugify('Complexity Table')).toBe('complexity-table');
	});

	it('collapses the runs a stripped character leaves behind', () => {
		expect(slugify('$O(\\log n)$ - Logarithmic Complexity')).toBe(
			'olog-n-logarithmic-complexity'
		);
	});

	it('strips component markup and expressions from heading text', () => {
		expect(slugify('Title <Badge /> and {expr}')).toBe('title-and');
	});
});

describe('headings', () => {
	it('collects every heading with its level', async () => {
		const { metadata } = await render(DOC);
		const headings = headingsOf(metadata);

		expect(headings.map((h) => h.level)).toEqual([2, 3, 2]);
		expect(headings.map((h) => h.text)).toEqual([
			'Dictionary',
			'O(\\log n) - Logarithmic Complexity',
			'Complexity Table'
		]);
	});

	it('assigns the id to the heading element itself', async () => {
		const { html } = await render(DOC);
		expect(html).toContain('<h2 id="dictionary">');
		expect(html).toContain('<h2 id="complexity-table">');
	});

	it('derives the id from prose, not from KaTeX markup', async () => {
		// The ordering guarantee. If this ran after KaTeX the slug would be built
		// from `<span class="katex">…` and would change whenever KaTeX's output
		// did, breaking every anchor anyone had shared.
		const { metadata, html } = await render(DOC);
		const mathHeading = headingsOf(metadata)[1];

		expect(mathHeading.id).toBe('olog-n-logarithmic-complexity');
		expect(mathHeading.id).not.toContain('katex');
		expect(html).toContain('id="olog-n-logarithmic-complexity"');
	});

	it('THE contract: the collected id and the element id are the same string', async () => {
		// A table of contents builds its href from the collected id while the page
		// anchor comes from the element. Two derivations that must agree forever is
		// the bug this feature exists to remove, so it is asserted directly.
		const { metadata, html } = await render(DOC);

		for (const heading of headingsOf(metadata)) {
			expect(html).toContain(`id="${heading.id}"`);
			expect(heading.id).toBe(slugify(heading.text));
		}
	});

	it('renders maths in the html a table of contents displays', async () => {
		const { metadata } = await render(DOC);
		const mathHeading = headingsOf(metadata)[1];

		expect(mathHeading.html).toContain('katex');
		// The same KaTeX options as the body, so MathML by default: navigation
		// should not be the one place the maths goes silent.
		expect(mathHeading.html).toContain('katex-mathml');
		expect(mathHeading.html).toContain('- Logarithmic Complexity');
	});

	it('leaves plain headings as plain text in html', async () => {
		const { metadata } = await render(DOC);
		expect(headingsOf(metadata)[0].html).toBe('Dictionary');
	});

	it('can be narrowed to particular levels', async () => {
		const { metadata, html } = await render(DOC, { headings: { levels: [2] } });

		expect(headingsOf(metadata).map((h) => h.level)).toEqual([2, 2]);
		// An h3 outside the configured levels gets no id either.
		expect(html).not.toContain('<h3 id=');
	});

	it('can be turned off entirely', async () => {
		const { metadata, html } = await render(DOC, { headings: false });

		expect(metadata.headings).toBeUndefined();
		expect(html).not.toContain('id="dictionary"');
	});

	it('leaves a heading written as raw HTML alone', async () => {
		// Raw HTML in a document stays a `raw` node and is never parsed into
		// elements — the same contract that lets injected components survive. So a
		// hand-written <h2> keeps exactly what its author wrote, id included, and
		// is not collected. Parsing it would mean running rehype-raw, which would
		// also mangle every component in the document.
		const { metadata, html } = await render('<h2 id="chosen">Written by hand</h2>');

		expect(html).toContain('<h2 id="chosen">Written by hand</h2>');
		expect(headingsOf(metadata)).toHaveLength(0);
	});

	it('owns metadata.headings, and says so rather than merging', async () => {
		// Two sources for one key cannot both win. skavex takes it when the
		// feature is on; a project that wants its own shape turns it off.
		/** @returns {(tree: import('hast').Root, file: import('vfile').VFile) => void} */
		const setOwn = () => (tree, file) => {
			file.data.fm = { ...(file.data.fm ?? {}), headings: ['mine'] };
		};

		const taken = await render(DOC, { remarkPlugins: [setOwn] });
		expect(headingsOf(taken.metadata)[0]).not.toBe('mine');

		const yielded = await render(DOC, { headings: false, remarkPlugins: [setOwn] });
		expect(yielded.metadata.headings).toEqual(['mine']);
	});

	it('does not clobber frontmatter already on data.fm', async () => {
		const { metadata } = await render(`---\ntitle: Post\n---\n\n## One`);

		expect(metadata.title).toBe('Post');
		expect(headingsOf(metadata)).toHaveLength(1);
	});
});
