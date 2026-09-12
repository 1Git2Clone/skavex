# Writing documents

A document is markdown with YAML frontmatter. GitHub Flavored Markdown and
LaTeX are on by default.

```markdown
---
title: Sieve of Eratosthenes
tags: ['algorithms', 'number theory']
---

## Why $O(n \log \log n)$?

Crossing out the multiples of each prime $p \le \sqrt{n}$ costs $n/p$ writes.
```

## Metadata

`metadata` is an open object, and skavex puts nothing of its own in it.
Frontmatter is one contributor; a plugin is another. What a document exports is
whatever the pipeline left there.

A plugin writes `file.data.fm`, which is vfile's convention rather than an API
of skavex's — there is nothing to import:

```js
export function remarkReadingTime() {
	return (tree, file) => {
		file.data.fm = { ...(file.data.fm ?? {}), readingTime: estimate(tree) };
	};
}
```

Spread what is there rather than assigning over it. That is the whole of the
etiquette, and the reason is that a plugin does not know what ran before it —
assign, and you discard the author's frontmatter whenever you happen to run
second.

A document tree can be asked for a great deal: a table of contents, a reading
time, the outbound links, the languages of the code blocks, a word count, the
first image, the footnotes. None of it is skavex's to decide or to implement.
Remark and rehype exist for exactly this, the ecosystem is full of plugins
that already do it, and being on unified 11 is what lets you use them.

Because the shape is the project's, values arrive typed `unknown`. Narrow them
where they are consumed:

```ts
const headings = metadata.headings as TocEntry[] | undefined;
```

## Headings and tables of contents

skavex does not do this, and that is the answer rather than an omission. Heading
ids are [`rehype-slug`](https://github.com/rehypejs/rehype-slug), which handles
deduplication properly through `github-slugger`. A table of contents is a walk
over the same tree in whatever shape your navigation needs:

```js
import rehypeSlug from 'rehype-slug';
import { visit } from 'unist-util-visit';
import { toString } from 'hast-util-to-string';

function rehypeToc() {
	return (tree, file) => {
		const toc = [];
		visit(tree, 'element', (node) => {
			const level = Number(/^h([1-6])$/.exec(node.tagName)?.[1]);
			if (level) toc.push({ id: node.properties.id, level, text: toString(node) });
		});
		file.data.fm = { ...(file.data.fm ?? {}), toc };
	};
}

skavex({ rehypePlugins: [rehypeSlug, rehypeToc] });
```

**What skavex contributes is the ordering.** `rehypePlugins` runs _before_
KaTeX, so a heading still reads as `$O(\log n)$ - Logarithmic Complexity`
rather than as `<span class="katex">…`. Run a slugger after KaTeX and the id is
built from KaTeX's markup, changing whenever KaTeX's output does, silently
breaking every anchor anyone has shared. That guarantee is the part a library
can usefully own; the walk is not.

Earlier versions shipped a `rehypeHeadings` plugin of their own. It was one
project's table of contents living in the core of a library whose scope is
unified 11, Svelte, LaTeX and Markdown — and a hand-written slugger that needed
bugs fixed into it to approximate what `github-slugger` already did. The
playground's `contents` plugin is the replacement, editable in the browser: it
is the whole feature, in about forty lines, owned by the project that wants it.

## What a document cannot contain

Two things, both because a document becomes a real Svelte component rather than
a string of HTML:

**A raw `<script>` block.** Svelte permits one instance script per component and
skavex generates it, so an author's collides with it. skavex does not hoist or
merge the two. A document that needs behaviour should use a component, which is
the thing components are for.

**Raw HTML written in uppercase.** `<BR>` and `<IMG>` are legal HTML, but
Svelte's rule is that a capitalised tag is a component — so it is not void, it
swallows what follows it, and the enclosing paragraph fails to close. Write
`<br>`. Nothing can be done about this without rewriting the markup an author
wrote, which is worse.

Both fail loudly, at compile time, with a Svelte error. Neither can corrupt a
page quietly.

## Braces

Svelte reads `{` in markup as the start of an expression. A document that
mentions `{braces}` in prose would therefore fail to compile, or worse, compile
into a reference to a variable that does not exist.

skavex escapes braces in **text** and leaves them alone inside **component
tags**, so this document works:

```markdown
Prose containing {braces}, and a component using them as a real prop:

<Counter start={3} />
```

Text braces become `&#123;` and `&#125;`; the component's `start={3}` is
untouched and is a live Svelte expression. This is the single most fiddly part
of putting Svelte and markdown together, and it is the reason the escape pass
runs last, after every plugin has finished injecting markup.
