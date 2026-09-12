import { describe, expect, it } from 'vitest';
import { compile as compileSvelte } from 'svelte/compiler';
import { compile, render } from '../src/index.js';
import { referencedComponents } from '../src/browser.js';
import { rehypeHeadings } from '../src/plugins.js';

/**
 * Adversarial markdown, one payload at a time.
 *
 * The rest of the suite checks that each feature works. This file checks the
 * seams between them — the documents where two correct behaviours meet and one
 * of them has to give way. A markdown engine that emits Svelte has an unusual
 * number of those, because text an author meant literally and markup a plugin
 * meant seriously travel through the same tree, and telling them apart wrongly
 * either breaks the build or silently eats the document.
 *
 * Payloads here come from asking "what would a real post contain that nobody
 * thought about?" — a tutorial whose code samples are Svelte, a reference with
 * "Examples" as a heading four times, a page whose title is an emoji.
 *
 * @module
 */

const HEADINGS = { rehypePlugins: [rehypeHeadings] };

/**
 * Render, and fail loudly if the headings plugin produced nothing.
 *
 * @param {string} source Markdown to render.
 * @returns {Promise<{html: string, headings: import('../src/headings.js').HeadingEntry[]}>}
 */
async function headingsOf(source) {
	const { html, metadata } = await render(source, HEADINGS);
	if (!metadata.headings) throw new Error('no headings were collected');
	return {
		html,
		headings: /** @type {import('../src/headings.js').HeadingEntry[]} */ (metadata.headings)
	};
}

/**
 * Compile a document and assert the Svelte compiler accepts the result.
 *
 * The end-to-end claim for every payload below: whatever the document contains,
 * what comes out is a component that builds. Asserting on the HTML alone would
 * miss the failures that matter most, because they happen one stage later.
 *
 * @param {string} source Markdown to put through the whole pipeline.
 * @returns {Promise<string>} The generated Svelte source.
 */
async function compiles(source) {
	const { code } = await compile(source);
	const { warnings } = compileSvelte(code, { name: 'Doc', generate: 'server' });
	expect(warnings).toEqual([]);
	return code;
}

describe('markup that only looks like a component', () => {
	// The central ambiguity of the whole library. `<Counter />` in a fenced block
	// is a code sample; the identical string injected by a plugin is a component
	// that must reach the compiler intact. Get this backwards in one direction
	// and a tutorial about Svelte renders as a blank space where its examples
	// were; backwards in the other and a post about generics fails to build.

	it('leaves a component in a fenced code block as text, and imports nothing', async () => {
		const code = await compiles('```svelte\n<Counter start={3} />\n```\n');

		expect(code).not.toContain('import Counter');
		expect(code).toContain('&lt;Counter');
		// The braces of the sample are escaped too, or Svelte reads them as an
		// expression over a variable the document never defines.
		expect(code).toContain('&#123;3&#125;');
	});

	it('leaves a component in inline code alone', async () => {
		const { html } = await render('Use `<Counter />` in the markup.');

		expect(referencedComponents(html)).toEqual([]);
		expect(html).toContain('<code>');
	});

	it('leaves a component in an indented code block alone', async () => {
		// Four spaces is a code block in CommonMark, which is the whole reason
		// indentation support is not free: the indent has to survive parsing as
		// code rather than being read as a component at the start of a line.
		const { html } = await render('    <Counter />\n');

		expect(referencedComponents(html)).toEqual([]);
		expect(html).toContain('<pre>');
	});

	it('keeps a component that a plugin meant seriously, in every nesting', async () => {
		// The other direction: a list item, a blockquote and a table cell are all
		// places a plugin legitimately injects markup, and none of them is the
		// top level where it is easiest to get right.
		const { html } = await render(
			[
				'- item <Badge />',
				'',
				'> quote <Badge />',
				'',
				'| a |',
				'| - |',
				'| <Badge /> |'
			].join('\n')
		);

		expect(referencedComponents(html)).toEqual(['Badge']);
		expect(html.match(/<Badge \/>/g)).toHaveLength(3);
	});
});

describe('heading ids under collision', () => {
	it('does not hand two headings the same id', async () => {
		// A reference page with "Examples" under every section is an ordinary
		// document, and duplicate ids are invalid HTML: every link to the second
		// one lands on the first, silently and forever.
		const { html, headings } = await headingsOf('## Setup\n\ntext\n\n## Setup\n');

		expect(headings.map((h) => h.id)).toEqual(['setup', 'setup-1']);
		expect(html).toContain('id="setup"');
		expect(html).toContain('id="setup-1"');
	});

	it('counts headings that differ only in case or punctuation as collisions', async () => {
		// They collide because slugify erases the difference, so the check has to
		// happen on the slug rather than on the text.
		const { headings } = await headingsOf('## Setup\n\n## setup\n\n## SET UP!\n');

		expect(headings.map((h) => h.id)).toEqual(['setup', 'setup-1', 'set-up']);
	});

	it('gives an id to a heading whose text slugifies to nothing', async () => {
		// An emoji title, a rule-shaped heading, a heading that is only maths. An
		// empty id attribute is invalid, and a table of contents built from one
		// has an href of "#", which goes nowhere.
		const { headings } = await headingsOf('## 🎉\n\n## ---\n\n## ???\n');

		expect(headings.map((h) => h.id)).toEqual(['heading', 'heading-1', 'heading-2']);
		expect(headings.every((h) => h.id !== '')).toBe(true);
	});

	it('never renames an id an author wrote, and moves a collision out of its way', async () => {
		// A written id may already be linked from somewhere skavex cannot see, so
		// it is the one thing here that is not negotiable. The generated id yields.
		/** @returns {(tree: import('hast').Root) => void} */
		const claimTheSlug = () => (tree) => {
			const second = /** @type {import('hast').Element} */ (
				tree.children.filter((n) => n.type === 'element')[1]
			);
			second.properties.id = 'setup';
		};

		const { metadata } = await render('## Setup\n\n## Other\n', {
			rehypePlugins: [claimTheSlug, rehypeHeadings]
		});
		const headings = /** @type {import('../src/headings.js').HeadingEntry[]} */ (
			metadata.headings
		);

		expect(headings.map((h) => h.id)).toEqual(['setup-1', 'setup']);
	});

	it('starts the numbering again for the next document', async () => {
		// The counter is per document. Shared across a build, a post's anchors
		// would depend on how many files were rendered before it — reproducible
		// only by chance, and different on every incremental rebuild.
		const first = await headingsOf('## Setup\n\n## Setup\n');
		const second = await headingsOf('## Setup\n\n## Setup\n');

		expect(second.headings.map((h) => h.id)).toEqual(first.headings.map((h) => h.id));
	});

	it('collects a setext heading like any other', async () => {
		const { headings } = await headingsOf('Title\n=====\n');

		expect(headings).toEqual([{ id: 'title', level: 1, text: 'Title', html: 'Title' }]);
	});

	it('drops component markup from a heading without losing the prose around it', async () => {
		// The entry is a string for navigation to display, so a component in a
		// heading cannot survive into it — but the words on either side must, and
		// the id must come from them rather than from the tag.
		const { html, headings } = await headingsOf('## Title <Badge /> here\n');

		expect(headings[0].id).toBe('title-here');
		expect(headings[0].html).not.toContain('Badge');
		expect(headings[0].html).toContain('Title');
		expect(headings[0].html).toContain('here');
		// The component itself still belongs to the document.
		expect(html).toContain('<Badge />');
	});
});

describe('frontmatter that is not a mapping', () => {
	it.each([
		['empty', '---\n---\n\nbody'],
		['a bare scalar', '---\njust a string\n---\n\nbody'],
		['a list', '---\n- a\n- b\n---\n\nbody']
	])('ignores frontmatter that is %s', async (_, source) => {
		// A list is the trap: `typeof [] === 'object'`, so without an array check
		// `- a` spreads into the metadata as `{0: 'a'}` — not what anyone wrote,
		// and hard to trace back from the rendered page.
		const { metadata, html } = await render(source);

		expect(metadata).toEqual({});
		expect(html).toContain('<p>body</p>');
	});

	it('treats a rule further down the document as a rule, not as frontmatter', async () => {
		const { metadata, html } = await render('para\n\n---\n\npara');

		expect(metadata).toEqual({});
		expect(html).toContain('<hr>');
	});

	it('reads frontmatter written with CRLF line endings', async () => {
		const { metadata } = await render('---\r\ntitle: Post\r\n---\r\n\r\nbody\r\n');

		expect(metadata.title).toBe('Post');
	});

	it('survives a value that would close the script block it is embedded in', async () => {
		// metadata is serialised into a <script module>, so a frontmatter value
		// containing </script> would end the block early and put the rest of the
		// JSON into the markup as text.
		const code = await compiles('---\ntitle: "a </script> b"\n---\n\nbody\n');

		expect(code).not.toContain('</script> b');
		expect(code).toContain('<\\/script>');
	});
});

describe('braces where they are easy to miss', () => {
	it.each([
		['an autolink', '<https://example.com/{a}>'],
		['a table cell', '| a |\n| - |\n| {b} |'],
		['an image title', '![alt](/a.png "{title}")'],
		['a link title', '[text](/a "{title}")'],
		['a footnote', 'text[^1]\n\n[^1]: a {brace}'],
		['a heading', '## A {brace} heading'],
		['a blockquote', '> quoted {brace}']
	])('escapes a brace in %s', async (_, source) => {
		const { html } = await render(source);

		expect(svelteAccepts(html)).toBe(true);
		expect(html).not.toMatch(/[^&#\d]\{/);
	});

	it('leaves an HTML comment alone, braces included', async () => {
		// A comment is raw markup, not text, so the escaper does not touch it —
		// and Svelte does not read expressions inside one either.
		const code = await compiles('Text\n\n<!-- a {brace} comment -->\n');

		expect(code).toContain('<!-- a {brace} comment -->');
	});
});

describe('documents with nothing in them', () => {
	it.each([
		['completely empty', ''],
		['only whitespace', '   \n\n'],
		['only frontmatter', '---\ntitle: Post\n---\n']
	])('compiles a document that is %s', async (_, source) => {
		const code = await compiles(source);

		expect(code).toContain('export const metadata =');
	});
});

describe('known limitations, pinned so they cannot change quietly', () => {
	it('cannot hoist a raw <script> block, and fails rather than dropping it', async () => {
		// A markdown document that writes its own <script> collides with the one
		// skavex generates, and Svelte permits a single instance script. skavex
		// does not hoist or merge it: the document becomes a component, so the
		// place for behaviour is a component. This is pinned because the failure
		// is a compiler error naming nothing the author wrote — if hoisting is
		// ever added, this test is where that decision gets made explicitly.
		const { code } = await compile('Text\n\n<script>alert(1)</script>\n');

		expect(code).toContain('<script>alert(1)</script>');
		expect(() => compileSvelte(code, { name: 'Doc', generate: 'server' })).toThrow(
			/single top-level/
		);
	});

	it('cannot take raw HTML written in uppercase, because Svelte reads it as a component', async () => {
		// `<BR>` is legal HTML and indistinguishable from a component reference —
		// to skavex's scanner and, more to the point, to Svelte, whose rule is that
		// a capitalised tag is a component. So it is not void, it swallows what
		// follows, and the paragraph fails to close. Nothing skavex can fix without
		// rewriting the author's markup: the answer is to write `<br>`.
		const { code } = await compile('Text<BR>more text\n');

		expect(referencedComponents(code)).toContain('BR');
		expect(() => compileSvelte(code, { name: 'Doc', generate: 'server' })).toThrow(
			/attempted to close an element that was not open/
		);
	});

	it('passes a raw <style> block through to the component', async () => {
		// The counterpart, and it works: a component may have one <style>, and the
		// generated module does not use it, so an author's survives.
		const code = await compiles('Text\n\n<style>p{color:red}</style>\n');

		expect(code).toContain('<style>p{color:red}</style>');
	});
});

/**
 * Whether the Svelte compiler accepts this markup at all.
 *
 * @param {string} markup Rendered document HTML.
 * @returns {boolean} True when it parses and compiles.
 */
function svelteAccepts(markup) {
	try {
		compileSvelte(markup, { name: 'Doc', generate: 'server' });
		return true;
	} catch {
		return false;
	}
}
