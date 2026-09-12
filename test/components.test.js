import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from '../src/index.js';
import { findComponents, selectUsedComponents } from '../src/components.js';
import { componentNode, rawHtmlExpression } from '../src/utils.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const COMPONENTS_DIR = './fixtures/components';

/**
 * A plugin that turns every code fence into a `<CodeBlock>`.
 *
 * @returns {(tree: import('mdast').Root) => void}
 */
const injectCodeBlock = () => (/** @type {import('mdast').Root} */ tree) => {
	tree.children = tree.children.map((node) =>
		node.type === 'code'
			? componentNode(
					'CodeBlock',
					{ lang: node.lang ?? 'text' },
					rawHtmlExpression(`<pre>${node.value}</pre>`)
				)
			: node
	);
};

describe('findComponents', () => {
	it('discovers components recursively, keyed by basename', async () => {
		const { components } = await findComponents(COMPONENTS_DIR, ROOT);
		const names = components.map((c) => c.name).sort();
		expect(names).toEqual(['Callout', 'CodeBlock', 'YouTube']);
	});

	it('ignores files whose basename cannot be a component tag', async () => {
		const { components } = await findComponents(COMPONENTS_DIR, ROOT);
		expect(components.map((c) => c.name)).not.toContain('notAComponent');
	});

	it('builds specifiers that preserve the configured spelling', async () => {
		const { components } = await findComponents(COMPONENTS_DIR, ROOT);
		const nested = components.find((c) => c.name === 'Callout');
		expect(nested?.specifier).toBe('./fixtures/components/nested/Callout.svelte');
	});

	it('returns nothing for a directory that does not exist', async () => {
		const { components } = await findComponents('./does-not-exist', ROOT);
		expect(components).toEqual([]);
	});
});

describe('selectUsedComponents', () => {
	const available = [
		{ name: 'YouTube', specifier: 'a' },
		{ name: 'CodeBlock', specifier: 'b' }
	];

	it('selects only the components the markup references', () => {
		const selected = selectUsedComponents('<p>x</p><YouTube id="1" />', available);
		expect(selected.map((c) => c.name)).toEqual(['YouTube']);
	});

	it('does not match escaped angle brackets from prose or code', () => {
		// By this point literal `<` in the document is already `&lt;`, so a code
		// sample mentioning <YouTube /> must not pull in an import.
		const selected = selectUsedComponents(
			'<p>&lt;YouTube /&gt; in a code sample</p>',
			available
		);
		expect(selected).toEqual([]);
	});

	it('deduplicates repeated usages', () => {
		const selected = selectUsedComponents('<YouTube /><YouTube />', available);
		expect(selected).toHaveLength(1);
	});
});

describe('compile with a components directory', () => {
	it('imports a component a plugin injected, without the plugin arranging it', async () => {
		const { code } = await compile('```py\nprint(1)\n```', {
			components: COMPONENTS_DIR,
			root: ROOT,
			remarkPlugins: [injectCodeBlock]
		});

		expect(code).toContain('import CodeBlock from "./fixtures/components/CodeBlock.svelte"');
		expect(code).toContain('<CodeBlock lang="py">');
	});

	it('does not import components the document never uses', async () => {
		const { code } = await compile('plain prose', {
			components: COMPONENTS_DIR,
			root: ROOT
		});

		expect(code).not.toContain('YouTube');
		expect(code).not.toContain('CodeBlock');
	});

	it('reports duplicate basenames rather than binding one silently', async () => {
		// Two files named Widget.svelte in different subdirectories. Only one can
		// be reached by tag, so the other must be reported rather than shadowed.
		const { components, duplicates } = await findComponents('./fixtures/dupes', ROOT);

		expect(duplicates).toEqual(['Widget']);
		expect(components.filter((c) => c.name === 'Widget')).toHaveLength(1);
		expect(components.map((c) => c.name).sort()).toEqual(['Unique', 'Widget']);
	});
});

describe('utils', () => {
	it('serialises props by type', () => {
		const node = componentNode('YouTube', { id: 'abc', start: 30, loop: true });
		expect(node.value).toBe('<YouTube id="abc" start={30} loop={true} />');
	});

	it('omits undefined props', () => {
		const node = componentNode('YouTube', { id: 'abc', title: undefined });
		expect(node.value).toBe('<YouTube id="abc" />');
	});

	it('escapes backticks and interpolation in raw html expressions', () => {
		// Highlighted code routinely contains both; unescaped they break out of
		// the template literal and corrupt the component.
		const expression = rawHtmlExpression('a ` b ${c}');
		expect(expression).toBe('{@html `a \\` b \\${c}`}');
	});
});
