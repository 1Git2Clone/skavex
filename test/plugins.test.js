import { describe, expect, it } from 'vitest';
import { visit } from 'unist-util-visit';
import remarkDirective from 'remark-directive';
import rehypeExternalLinks from 'rehype-external-links';
import rehypeSlug from 'rehype-slug';
import { toString } from 'hast-util-to-string';
import { compile, render } from '../src/index.js';
import { componentNode, setMetadata } from '../src/utils.js';

/**
 * Turn `:::note` into a `<Callout>` component.
 *
 * The pairing worth showing: a third-party plugin gives markdown a syntax it
 * does not have, and skavex turns the result into a Svelte component. Neither
 * half knows about the other.
 *
 * @returns {(tree: import('mdast').Root) => void} A remark transformer.
 */
function remarkCallout() {
	return (tree) => {
		visit(tree, (node, index, parent) => {
			if (node.type !== 'containerDirective' || index === undefined || !parent) return;
			if (node.name !== 'note' && node.name !== 'warning') return;

			parent.children[index] = componentNode('Callout', { type: node.name });
		});
	};
}

describe('third-party remark plugins', () => {
	it('runs remark-directive, whose syntax markdown does not have on its own', async () => {
		const source = ':::note\nBody text.\n:::\n';

		// Without the plugin the directive is prose, which is the control that
		// makes the next assertion mean something.
		const plain = await render(source);
		expect(plain.html).toContain(':::note');

		const { html } = await render(source, { remarkPlugins: [remarkDirective, remarkCallout] });
		expect(html).toContain('<Callout');
		expect(html).not.toContain(':::note');
	});

	it('still escapes prose braces around a component a plugin injected', async () => {
		// The ordering guarantee, tested where it can actually break: escaping
		// runs after every plugin, so it sees the injected tag and leaves it alone
		// while escaping the text beside it.
		const { code } = await compile('Prose with {braces}.\n\n:::note\nx\n:::\n', {
			remarkPlugins: [remarkDirective, remarkCallout]
		});

		expect(code).toContain('&#123;braces&#125;');
		expect(code).toContain('<Callout type="note"');
	});
});

describe('third-party rehype plugins', () => {
	it('runs rehype-external-links on the HTML tree', async () => {
		const { html } = await render('[out](https://example.com) and [in](/here)\n', {
			rehypePlugins: [[rehypeExternalLinks, { target: '_blank', rel: ['noopener'] }]]
		});

		expect(html).toContain('target="_blank"');
		// Internal links are left alone, which is the plugin doing its job rather
		// than skavex mangling every anchor.
		expect(html).toMatch(/<a href="\/here"[^>]*>in<\/a>/);
	});

	it('gives headings ids, which is rehype-slug and not skavex', async () => {
		// skavex had its own heading collector once, on by default, with an option
		// and a field in the metadata type. It was one project's requirement living
		// in the core of a library whose scope is unified 11, Svelte, LaTeX and
		// Markdown. This is what replaced it: a plugin nobody here wrote, doing the
		// job properly — github-slugger's deduplication included, which the hand
		// written one had to have bugs fixed into it to approximate.
		const { html } = await render('## Setup\n\n## Setup\n\n## 🎉\n', {
			rehypePlugins: [rehypeSlug]
		});

		expect(html).toContain('<h2 id="setup">');
		expect(html).toContain('<h2 id="setup-1">');
		// And an emoji heading gets `id=""`, which is rehype-slug's call to make
		// and a project's to override with another plugin. Pinned because it is
		// the shape of the whole argument: skavex having an opinion about this
		// would be skavex having an opinion about somebody else's navigation.
		expect(html).toContain('<h2 id="">🎉</h2>');
	});

	it('collects a table of contents, in about as many lines as it takes to say so', async () => {
		// The other half of what was removed, written here in full. This is the
		// entire feature: a walk, a shape the project chose, one write to the
		// metadata. There is nothing skavex could add to it that would not be a
		// guess about what somebody else's navigation needs.
		/** @returns {(tree: import('hast').Root, file: import('vfile').VFile) => void} */
		const rehypeToc = () => (tree, file) => {
			/** @type {{id: string, level: number, text: string}[]} */
			const toc = [];
			visit(tree, 'element', (node) => {
				const level = Number(/^h([1-6])$/.exec(node.tagName)?.[1]);
				if (level)
					toc.push({ id: String(node.properties.id), level, text: toString(node) });
			});
			setMetadata(file, { toc });
		};

		const { metadata } = await render('## Why $O(n)$ matters\n\n### Detail\n', {
			// Order is the one thing that matters: ids before the collector reads
			// them, and both before KaTeX, which is what `rehypePlugins` guarantees.
			rehypePlugins: [rehypeSlug, rehypeToc]
		});

		expect(metadata.toc).toEqual([
			{ id: 'why-on-matters', level: 2, text: 'Why O(n) matters' },
			{ id: 'detail', level: 3, text: 'Detail' }
		]);
	});

	it('sees prose in headings, because rehype plugins run before KaTeX', async () => {
		/** @type {string[]} */
		const seen = [];

		/** @returns {(tree: import('hast').Root) => void} A rehype transformer. */
		const spy = () => (tree) => {
			visit(tree, 'element', (node) => {
				if (node.tagName !== 'h2') return;
				visit(node, 'text', (text) => seen.push(text.value));
			});
		};

		await render('## Why $O(n)$ matters\n', { rehypePlugins: [spy] });

		// The LaTeX source, not `<span class="katex">`. A plugin that rewrites
		// heading text depends on this and would silently see markup otherwise.
		expect(seen.join('')).toContain('O(n)');
		expect(seen.join('')).not.toContain('katex');
	});
});
