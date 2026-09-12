/**
 * The files the playground opens with.
 *
 * A document and the components it references, because that pairing is the
 * whole point: markdown that can reach for a real Svelte component mid-prose.
 * Both are editable, and either can be replaced entirely.
 */

/** The markdown document. */
export const DOCUMENT = `---
title: Sieve of Eratosthenes
tags: ['algorithms', 'number theory']
---

## Why $O(n \\log \\log n)$?

Crossing out the multiples of each prime $p \\le \\sqrt{n}$ costs $n/p$ writes,
so the total is

$$
\\sum_{p \\le n} \\frac{n}{p} = n \\sum_{p \\le n} \\frac{1}{p} \\sim n \\ln \\ln n
$$

by Mertens' second theorem.

### Comparison

| Approach          | Complexity        | Space  |
| ----------------- | ----------------- | ------ |
| Trial division    | $O(n\\sqrt{n})$   | $O(1)$ |
| Sieve             | $O(n\\log\\log n)$ | $O(n)$ |

### Components

A Svelte component, written as a bare tag in the markdown — click it, it is
real, and it is running in this page:

<Counter start={3} />

<Callout type="note">

Edit either component in the file tree, or add your own. A component is
compiled into the document only once the document references it by name — and
its children are still markdown, maths included: $e^{i\\pi} + 1 = 0$.

</Callout>

And prose containing {braces}, which Svelte would otherwise read as an
expression — skavex escapes text but leaves the components above alone.

### Plugins

This ==highlighted text== is not markdown. It comes from the remark plugin in
the file tree, which skavex runs like any other unified plugin.
`;

/**
 * The components the document may reach for.
 *
 * @type {import('./build.js').WorkspaceFile[]}
 */
export const COMPONENTS = [
	{
		name: 'Counter',
		source: `<script>
	let { start = 0, step = 1 } = $props();
	let count = $state(start);
</script>

<button onclick={() => (count += step)}>
	counted to {count}
</button>

<style>
	button {
		background: #1d2130;
		color: inherit;
		border: 1px solid #2f3648;
		border-radius: 6px;
		padding: 0.4rem 0.9rem;
		font: inherit;
		cursor: pointer;
	}

	button:hover {
		border-color: #7aa2f7;
	}
</style>
`
	},
	{
		name: 'Callout',
		source: `<script>
	let { type = 'note', children } = $props();
</script>

<aside data-type={type}>
	<strong>{type}</strong>
	{@render children?.()}
</aside>

<style>
	aside {
		border-left: 3px solid #7aa2f7;
		background: #161922;
		border-radius: 0 6px 6px 0;
		margin: 1rem 0;
		padding: 0.75rem 1rem;
	}

	strong {
		color: #7aa2f7;
		text-transform: uppercase;
		font-size: 0.75rem;
		letter-spacing: 0.06em;
	}

	aside :global(p) {
		margin: 0.35rem 0 0;
	}
</style>
`
	}
];

/**
 * Plugins the pipeline runs, as editable source.
 *
 * skavex takes `remarkPlugins` and `rehypePlugins` like any unified pipeline;
 * the playground exposes that by compiling these and passing them in, so a
 * plugin can be written and its effect seen in the same breath.
 *
 * @type {import('./build.js').WorkspaceFile[]}
 */
export const PLUGINS = [
	{
		name: 'highlight',
		source: `import { visit } from 'unist-util-visit';

// Runs on the markdown tree, before it becomes HTML. Change 'remark' to
// 'rehype' to run on the HTML tree instead.
export const stage = 'remark';

/** Turn ==marked== into a <mark> element. */
export default function remarkHighlight() {
	return (tree) => {
		visit(tree, 'text', (node, index, parent) => {
			if (index === undefined || !parent || !node.value.includes('==')) return;

			const parts = node.value.split(/==([^=]+)==/g);
			if (parts.length === 1) return;

			parent.children.splice(
				index,
				1,
				...parts.map((part, i) =>
					i % 2 === 0
						? { type: 'text', value: part }
						: { type: 'html', value: '<mark>' + part + '</mark>' }
				)
			);
		});
	};
}
`
	}
];

/**
 * Starting source for a component added from the file tree.
 *
 * Lives here rather than in the component that calls it because a `.svelte`
 * file cannot contain the string `</script>` without escaping it, and an
 * escape ESLint is right to call useless is a poor trade for one template.
 *
 * @param {string} name What the new component is called.
 * @returns {string} Svelte source for it.
 */
export function newComponentSource(name) {
	return `<script>
	let { label = '${name}' } = $props();
</script>

<p>{label}</p>
`;
}

/**
 * Starting source for a plugin added from the file tree.
 *
 * @param {string} name What the new plugin is called.
 * @returns {string} A no-op remark plugin, ready to be edited into a real one.
 */
export function newPluginSource(name) {
	return `import { visit } from 'unist-util-visit';

export const stage = 'remark';

export default function ${name}() {
	return (tree) => {
		visit(tree, 'text', (node) => {
			// node.value is the text of one markdown text node.
		});
	};
}
`;
}

/** A component name markup can actually spell, matching the library's own rule. */
export const VALID_NAME = /^[A-Z][A-Za-z0-9_]*$/;
