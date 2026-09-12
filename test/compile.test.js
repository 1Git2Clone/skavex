import { describe, expect, it } from 'vitest';
import { compile as compileSvelte } from 'svelte/compiler';
import { compile, render } from '../src/index.js';

const WITH_FRONTMATTER = `---
title: Intro to Big O
tags: ['dsa', 'cs']
date: April 24 2024
---

Big $O$ notation, with a table:

| Complexity | Example      |
| ---------- | ------------ |
| $O(1)$     | array access |

~~struck~~ and a list:

- one
- two
`;

describe('render', () => {
	it('parses frontmatter into metadata', async () => {
		const { metadata } = await render(WITH_FRONTMATTER);
		expect(metadata.title).toBe('Intro to Big O');
		expect(metadata.tags).toEqual(['dsa', 'cs']);
	});

	it('renders GFM tables and strikethrough', async () => {
		const { html } = await render(WITH_FRONTMATTER);
		expect(html).toContain('<table>');
		expect(html).toContain('<del>');
	});

	it('renders math as both HTML and MathML by default', async () => {
		const { html } = await render('Inline $O(n)$ math.');
		expect(html).toContain('katex-html');
		// MathML is what makes the maths readable to a screen reader; HTML alone
		// is silent. Defaulting it off would be an accessibility regression.
		expect(html).toContain('katex-mathml');
	});

	it('keeps the frontmatter block out of the rendered body', async () => {
		const { html } = await render(WITH_FRONTMATTER);
		expect(html).not.toContain('April 24 2024');
		expect(html).not.toContain('---');
	});

	it('lets a plugin contribute metadata via data.fm', async () => {
		// The convention downstream plugins rely on for tables of contents and
		// reading time.
		/** @returns {(tree: import('mdast').Root, file: import('vfile').VFile) => void} */
		const addReadingTime = () => (tree, file) => {
			file.data.fm = { ...(file.data.fm ?? {}), readingTime: '7 min read' };
		};

		const { metadata } = await render(WITH_FRONTMATTER, { remarkPlugins: [addReadingTime] });
		expect(metadata.readingTime).toBe('7 min read');
		expect(metadata.title).toBe('Intro to Big O');
	});

	it('can disable gfm and math', async () => {
		const { html } = await render('| a |\n| - |\n\nand $x$', { gfm: false, math: false });
		expect(html).not.toContain('<table>');
		expect(html).not.toContain('katex');
	});

	it('accepts KaTeX option overrides', async () => {
		const { html } = await render('$x$', { math: { output: 'html' } });
		expect(html).toContain('katex');
		expect(html).not.toContain('katex-mathml');
	});
});

describe('compile', () => {
	it('emits a module exporting metadata', async () => {
		const { code } = await compile(WITH_FRONTMATTER);
		expect(code).toContain('<script module>');
		expect(code).toContain('export const metadata =');
		expect(code).toContain('"title":"Intro to Big O"');
	});

	it('produces Svelte the compiler accepts without warnings', async () => {
		const { code } = await compile(WITH_FRONTMATTER);
		const result = compileSvelte(code, { name: 'Doc', generate: 'server' });
		expect(result.warnings).toHaveLength(0);
	});

	it('wraps the document in the configured layout', async () => {
		const { code } = await compile('hello', { layout: '/src/Layout.svelte' });
		expect(code).toContain('import SkavexLayout from "/src/Layout.svelte"');
		expect(code).toContain('<SkavexLayout {...metadata} {...props}>');
		expect(code).toContain('</SkavexLayout>');
	});

	it('omits layout scaffolding when no layout is configured', async () => {
		const { code } = await compile('hello');
		expect(code).not.toContain('SkavexLayout');
		// No unused $props() call, which the compiler would flag.
		expect(code).not.toContain('$props()');
	});

	it('cannot be broken out of by a closing script tag in frontmatter', async () => {
		// Frontmatter is author-controlled, but a pasted value should not be able
		// to terminate the module block and inject code.
		const source = `---\ntitle: "</script><script>alert(1)</script>"\n---\n\nbody`;
		const { code } = await compile(source);

		expect(code).not.toContain('</script><script>alert(1)');
		expect(code).toContain('<\\/script>');
		expect(compileSvelte(code, { name: 'Doc', generate: 'server' }).warnings).toHaveLength(0);
	});

	it('round-trips metadata through the generated module', async () => {
		const { code } = await compile(WITH_FRONTMATTER);
		const literal = code.match(/export const metadata = (.*);/)?.[1];
		expect(literal).toBeDefined();
		expect(JSON.parse(/** @type {string} */ (literal))).toMatchObject({
			title: 'Intro to Big O',
			tags: ['dsa', 'cs']
		});
	});
});
