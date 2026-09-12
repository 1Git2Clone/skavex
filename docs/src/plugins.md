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

Any plugin may write to `file.data.fm`, and whatever is there is exported as
`metadata`:

```js
export function remarkReadingTime() {
	return (tree, file) => {
		file.data.fm = { ...(file.data.fm ?? {}), readingTime: estimate(tree) };
	};
}
```

## Trying one

The [playground](https://pages.hu-tao.dev/skavex/skavex/) has an editable
remark plugin in its file tree, and rebuilds the document as you change it.
