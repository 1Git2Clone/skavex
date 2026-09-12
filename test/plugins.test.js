import { describe, expect, it } from 'vitest';
import { visit } from 'unist-util-visit';
import remarkDirective from 'remark-directive';
import rehypeExternalLinks from 'rehype-external-links';
import { compile, render } from '../src/index.js';
import { componentNode } from '../src/utils.js';

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
