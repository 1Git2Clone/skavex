# Plugins

skavex is a unified pipeline, so remark and rehype plugins work unmodified:

```js
skavex({
	remarkPlugins: [remarkReadingTime],
	rehypePlugins: [rehypeExternalLinks]
});
```

Where they run, and why the order is what it is:

```text
remark-parse
  → frontmatter
  → gfm
  → math
  → YOUR remark plugins
  → remark-rehype
  → heading ids and TOC collection
  → YOUR rehype plugins
  → katex
  → brace escaping
  → stringify
```

**Rehype plugins run before KaTeX** so a plugin reading heading text sees the
prose an author wrote, not `<span class="katex">…`. **Brace escaping runs
last** so it can see every tag a plugin injected and leave those alone while
escaping the text around them.

## Injecting a component from a plugin

Replace a node with an mdast `html` node and the component survives to the
compiler. `@skavex/skavex/utils` has the fiddly parts:

```js
import { componentNode, getBareLinkFromParagraph } from '@skavex/skavex/utils';
import { visit } from 'unist-util-visit';

export function remarkYouTube() {
	return (tree) => {
		visit(tree, 'paragraph', (node, index, parent) => {
			const url = getBareLinkFromParagraph(node);
			if (!url) return;
			parent.children[index] = componentNode('YouTube', { id: idFrom(url) });
		});
	};
}
```

With a `components` directory configured, nothing else is needed: skavex scans
it, sees `<YouTube` in the output, and emits the import.

`rawHtmlExpression(html)` builds a `{@html ...}` expression with backticks and
`${` escaped. Highlighted code contains both, and unescaped they break out of
the template literal.

## Adding to the metadata

`metadata` is an open object with nothing of skavex's own in it but the
document's frontmatter. Write `file.data.fm` — vfile's convention, and there is
nothing to import for it — and whatever you put there is exported:

```js
export function remarkReadingTime() {
	return (tree, file) => {
		file.data.fm = { ...(file.data.fm ?? {}), readingTime: estimate(tree) };
	};
}
```

Spread what is there rather than assigning over it. A plugin does not know what
ran before it, so an assignment discards the author's frontmatter whenever it
happens to run second.

This is how every metadata key gets there. skavex writes exactly one of its
own — the document's frontmatter — and a plugin you write has the same standing
as that. Later writers win, so ordering decides who owns a contested key.

## Giving markdown a syntax it does not have

The pairing worth knowing about: a third-party plugin adds syntax, and skavex
turns the result into a component. Neither half knows about the other.

[`remark-directive`](https://github.com/remarkjs/remark-directive) adds
`:::name` blocks, which markdown has no notion of:

```markdown
:::note
Body text, still markdown.
:::
```

A ten-line plugin turns those into a component:

```js
import remarkDirective from 'remark-directive';
import { componentNode } from '@skavex/skavex/utils';
import { visit } from 'unist-util-visit';

function remarkCallout() {
	return (tree) => {
		visit(tree, (node, index, parent) => {
			if (node.type !== 'containerDirective' || index === undefined || !parent) return;
			parent.children[index] = componentNode('Callout', { type: node.name });
		});
	};
}

skavex({
	components: '/src/lib/components/md',
	remarkPlugins: [remarkDirective, remarkCallout]
});
```

With `Callout.svelte` in the components directory, that is the whole of it —
skavex sees `<Callout` in the output and emits the import.

The brace escaping still applies around it. Prose containing `{braces}` beside
an injected component compiles, because escaping runs after every plugin: it
sees the tag and leaves it alone. `test/plugins.test.js` asserts exactly that,
against the real `remark-directive`.

## Plugins that work unmodified

Anything targeting unified 11. Verified in this repository's test suite rather
than assumed:

- [`remark-directive`](https://github.com/remarkjs/remark-directive) — the
  recipe above.
- [`rehype-external-links`](https://github.com/rehypejs/rehype-external-links) —
  `rehypePlugins: [[rehypeExternalLinks, { target: '_blank', rel: ['noopener'] }]]`,
  which rewrites external anchors and leaves internal ones alone.

This is the part mdsvex cannot match, and it is the same constraint as the
maths: mdsvex pins unified 8, so a plugin written against 11 either fails or,
worse, does nothing.

## Trying one

The [playground](https://pages.hu-tao.dev/skavex/skavex/) has an editable
remark plugin in its file tree, and rebuilds the document as you change it.
