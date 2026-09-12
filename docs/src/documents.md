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

`setMetadata` is the entire contract — it merges, so a plugin cannot erase what
ran before it:

```js
import { setMetadata } from '@skavex/skavex/utils';

export function remarkReadingTime() {
	return (tree, file) => {
		setMetadata(file, { readingTime: estimate(tree) });
	};
}
```

A document tree can be asked for a great deal: a table of contents, a reading
time, the outbound links, the languages of the code blocks, a word count, the
first image, the footnotes. Which of those a given site wants is not skavex's
decision to make, so it ships one of them as an optional plugin
([`rehypeHeadings`](#headings-and-tables-of-contents)) and no others, and gives
every plugin the same way in.

Because the shape is the project's, values arrive typed `unknown`. Narrow them
where they are consumed:

```ts
import type { HeadingEntry } from '@skavex/skavex/plugins';

const headings = metadata.headings as HeadingEntry[] | undefined;
```

## Maths

Maths renders as **HTML and MathML** by default. HTML alone looks correct and
is completely silent to a screen reader, which makes maths-heavy writing
unreadable for anyone using one.

| `math.output`     | Result                                               |
| ----------------- | ---------------------------------------------------- |
| `'htmlAndMathml'` | Default. Looks identical everywhere, readable by AT. |
| `'html'`          | Visual only. Silent to assistive technology.         |
| `'mathml'`        | Native browser rendering. Much smaller.              |

`math: { output: 'mathml' }` is worth knowing about: it drops KaTeX's HTML and
leaves only the MathML, which every current browser renders natively. On the
benchmark corpus that is **half the build time and a quarter of the page
weight** — 5.7 kB against 21 kB of HTML. It is not the default because KaTeX's
HTML looks the same regardless of which maths fonts a reader has, but for a
maths-heavy site it is the first thing to try.

## Headings and tables of contents

`rehypeHeadings` gives every heading an `id` and collects them onto
`metadata.headings`. It is off unless you ask for it:

```js
import { rehypeHeadings } from '@skavex/skavex/plugins';

skavex({ rehypePlugins: [rehypeHeadings] });
// or [[rehypeHeadings, { levels: [2, 3] }]] to narrow it to h2 and h3
```

Each entry:

```js
{
  id: 'olog-n-logarithmic-complexity',
  level: 3,
  text: 'O(\\log n) - Logarithmic Complexity',    // maths as its LaTeX source
  html: '<span class="katex">…</span> - Logarithmic Complexity'
}
```

Two things this exists to get right, both easy to get wrong by hand.

**The id comes from the prose, not from KaTeX.** `rehypePlugins` runs _before_
KaTeX, so `### $O(\log n)$ - Logarithmic Complexity` slugifies from the LaTeX
source. Do it afterwards and the slug is built from `<span class="katex">…`,
which changes whenever KaTeX's output does — silently breaking every anchor
anyone has shared.

**One `slugify`, used on both sides.** A heading's `id` and a table of
contents' `href` are produced at different times, so a project that
reimplements the slug for its navigation keeps two copies that must agree
forever. They will not:

```js
import { slugify } from '@skavex/skavex';
```

`html` carries the heading with its maths typeset. Pass the same options you
gave `math` — `[[rehypeHeadings, { katexOptions }]]` — and a formula looks, and
reads to a screen reader, the same in the sidebar as in the text.

Nothing here is privileged. A project wanting a different shape writes its own
plugin the same way this one is written, and does not use this one — there is no
option to turn off, because there is nothing on.

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
