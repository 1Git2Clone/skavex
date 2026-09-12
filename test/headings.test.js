import { describe, expect, it } from 'vitest';
import { render, slugify } from '../src/index.js';
import { rehypeHeadings } from '../src/plugins.js';

const DOC = `
## Dictionary

text

### $O(\\log n)$ - Logarithmic Complexity

text

## Complexity Table
`;

/**
 * Render with the headings plugin turned on, the way a project would.
 *
 * `rehypePlugins` is the stage that runs before KaTeX, which is the whole
 * reason the plugin is usable from outside the library at all.
 *
 * @param {string} source Markdown to render.
 * @param {import('../src/browser.js').SkavexOptions} [options] Extra options; a
 *   `rehypePlugins` of its own replaces the default one.
 * @returns {Promise<{html: string, metadata: import('../src/browser.js').DocumentMetadata}>}
 */
function withHeadings(source, options = {}) {
	return render(source, { rehypePlugins: [rehypeHeadings], ...options });
}

/**
 * The collected headings, refusing to continue if there are none.
 *
 * Every test below is about what the entries contain, so a run where the plugin
 * produced nothing should fail here with that sentence rather than further down
 * with "cannot read properties of undefined". The cast is the point of the
 * metadata design rather than a wart in it: skavex does not know what a
 * project's plugins produce, so a consumer names the shape at the point of use.
 *
 * @param {import('../src/browser.js').DocumentMetadata} metadata
 * @returns {import('../src/headings.js').HeadingEntry[]}
 */
function headingsOf(metadata) {
	if (!metadata.headings) throw new Error('no headings were collected');
	return /** @type {import('../src/headings.js').HeadingEntry[]} */ (metadata.headings);
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

describe('rehypeHeadings', () => {
	it('does nothing at all unless it is asked for', async () => {
		// The library collects no metadata of its own. A table of contents is one
		// thing a document tree can be asked for among many, and which of them a
		// project wants is not skavex's decision to make.
		const { metadata, html } = await render(DOC);

		expect(metadata.headings).toBeUndefined();
		expect(html).not.toContain('id="dictionary"');
	});

	it('collects every heading with its level', async () => {
		const { metadata } = await withHeadings(DOC);
		const headings = headingsOf(metadata);

		expect(headings.map((h) => h.level)).toEqual([2, 3, 2]);
		expect(headings.map((h) => h.text)).toEqual([
			'Dictionary',
			'O(\\log n) - Logarithmic Complexity',
			'Complexity Table'
		]);
	});

	it('assigns the id to the heading element itself', async () => {
		const { html } = await withHeadings(DOC);
		expect(html).toContain('<h2 id="dictionary">');
		expect(html).toContain('<h2 id="complexity-table">');
	});

	it('derives the id from prose, not from KaTeX markup', async () => {
		// The ordering guarantee, and the reason this plugin belongs in
		// `rehypePlugins` rather than anywhere a user might otherwise put it. If it
		// ran after KaTeX the slug would be built from `<span class="katex">…` and
		// would change whenever KaTeX's output did, breaking every anchor anyone
		// had shared.
		const { metadata, html } = await withHeadings(DOC);
		const mathHeading = headingsOf(metadata)[1];

		expect(mathHeading.id).toBe('olog-n-logarithmic-complexity');
		expect(mathHeading.id).not.toContain('katex');
		expect(html).toContain('id="olog-n-logarithmic-complexity"');
	});

	it('THE contract: the collected id and the element id are the same string', async () => {
		// A table of contents builds its href from the collected id while the page
		// anchor comes from the element. Two derivations that must agree forever is
		// the bug this plugin exists to remove, so it is asserted directly.
		const { metadata, html } = await withHeadings(DOC);

		for (const heading of headingsOf(metadata)) {
			expect(html).toContain(`id="${heading.id}"`);
			expect(heading.id).toBe(slugify(heading.text));
		}
	});

	it('renders maths in the html a table of contents displays', async () => {
		const { metadata } = await withHeadings(DOC);
		const mathHeading = headingsOf(metadata)[1];

		expect(mathHeading.html).toContain('katex');
		// KaTeX's own defaults, which are what the default `math` option produces
		// too: navigation should not be the one place the maths goes silent.
		expect(mathHeading.html).toContain('katex-mathml');
		expect(mathHeading.html).toContain('- Logarithmic Complexity');
	});

	it('takes the KaTeX options it is given', async () => {
		const { metadata } = await withHeadings(DOC, {
			math: { output: 'mathml' },
			rehypePlugins: [[rehypeHeadings, { katexOptions: { output: 'mathml' } }]]
		});

		expect(headingsOf(metadata)[1].html).not.toContain('katex-html');
	});

	it('leaves plain headings as plain text in html', async () => {
		const { metadata } = await withHeadings(DOC);
		expect(headingsOf(metadata)[0].html).toBe('Dictionary');
	});

	it('can be narrowed to particular levels', async () => {
		const { metadata, html } = await withHeadings(DOC, {
			rehypePlugins: [[rehypeHeadings, { levels: [2] }]]
		});

		expect(headingsOf(metadata).map((h) => h.level)).toEqual([2, 2]);
		// An h3 outside the configured levels gets no id either.
		expect(html).not.toContain('<h3 id=');
	});

	it('leaves a heading written as raw HTML alone', async () => {
		// Raw HTML in a document stays a `raw` node and is never parsed into
		// elements — the same contract that lets injected components survive. So a
		// hand-written <h2> keeps exactly what its author wrote, id included, and
		// is not collected. Parsing it would mean running rehype-raw, which would
		// also mangle every component in the document.
		const { metadata, html } = await withHeadings('<h2 id="chosen">Written by hand</h2>');

		expect(html).toContain('<h2 id="chosen">Written by hand</h2>');
		expect(headingsOf(metadata)).toHaveLength(0);
	});

	it('is just another contributor, and loses to a plugin that runs after it', async () => {
		// Nothing about this plugin is privileged. A project wanting its own shape
		// on `metadata.headings` writes it and orders it later — or simply does not
		// use this one. There is no option to turn off, because there is nothing on.
		/** @returns {(tree: import('hast').Root, file: import('vfile').VFile) => void} */
		const setOwn = () => (tree, file) => {
			file.data.fm = { ...(file.data.fm ?? {}), headings: ['mine'] };
		};

		const { metadata } = await render(DOC, { rehypePlugins: [rehypeHeadings, setOwn] });
		expect(metadata.headings).toEqual(['mine']);
	});

	it('does not clobber frontmatter already on data.fm', async () => {
		const { metadata } = await withHeadings(`---\ntitle: Post\n---\n\n## One`);

		expect(metadata.title).toBe('Post');
		expect(headingsOf(metadata)).toHaveLength(1);
	});
});

describe('the removed headings option', () => {
	it('says so rather than quietly doing nothing', async () => {
		// The whole failure mode this guards: an ignored option looks exactly like
		// a working one until someone notices the table of contents is empty.
		/** @type {string[]} */
		const warnings = [];
		const original = console.warn;
		console.warn = (message) => warnings.push(String(message));

		try {
			// @ts-expect-error - removed in 0.4.0; a JavaScript caller can still pass it.
			await render(DOC, { headings: { levels: [2] } });
		} finally {
			console.warn = original;
		}

		expect(warnings.join('\n')).toContain('removed in 0.4.0');
		expect(warnings.join('\n')).toContain('rehypeHeadings');
	});
});
