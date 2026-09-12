# skavex

**Server-rendered Markdown + LaTeX for Svelte.** A Vite plugin that compiles
`.md` files into real Svelte components — so your posts are HTML on first paint,
with no client-side markdown parsing, no layout shift, and nothing a crawler has
to run JavaScript to see.

The name alternates between the two things it joins:

| s                 | ka               | v                        | ex               |
| ----------------- | ---------------- | ------------------------ | ---------------- |
| **S**&#8203;velte | **Ka**&#8203;TeX | S&#8203;**v**&#8203;elte | Ka&#8203;**TeX** |

## Why

[mdsvex](https://mdsvex.pngwn.io/) has been in maintenance mode for a long time,
and it bundles **unified 8** (2020). Modern `remark-math` and `rehype-katex`
target unified 11. Combining them does not error — it compiles "successfully"
and silently emits no maths at all:

```
current pins (remark-math 3 + rehype-katex 3)   katex spans = 5   mathml = 0
modern      (remark-math 6 + rehype-katex 7)    katex spans = 0   mathml = 0   <- silent
```

There is nothing to search for and nothing in a stack trace. If you have ever
lost a day to that, this library is the way out: it owns the pipeline, so the
unified version is yours to choose.

## Install

```sh
pnpm add -D @skavex/skavex
```

## Use

skavex is a Vite plugin, so it goes in `vite.config.js`:

```js
// vite.config.js
import { skavex } from '@skavex/skavex/vite';
import { sveltekit } from '@sveltejs/kit/vite';

export default {
	plugins: [
		// Before sveltekit(): skavex produces Svelte source, which the Svelte
		// plugin then compiles.
		skavex({
			layout: '/src/lib/components/PostLayout.svelte',
			components: '/src/lib/components/md'
		}),
		sveltekit()
	]
};
```

and `svelte.config.js` has to recognise the extension:

```js
// svelte.config.js
export default {
	extensions: ['.svelte', '.md']
};
```

Then import a document like any other component:

```js
const posts = import.meta.glob('/src/content/*.md', { eager: true });
const { default: Post, metadata } = posts['/src/content/hello.md'];
```

> **Forgetting `.md` in `extensions` is the one failure worth knowing up front.**
> skavex emits valid Svelte, the Svelte plugin ignores it for not being a Svelte
> file, and the browser is served component source as a module.

## Options

| Option          | Type                | Default     | Meaning                                                                                             |
| --------------- | ------------------- | ----------- | --------------------------------------------------------------------------------------------------- |
| `extensions`    | `string[]`          | `['.md']`   | Which files are documents.                                                                          |
| `layout`        | `string`            | —           | Component wrapping every document. Gets the metadata as props; the body is its `children`.          |
| `components`    | `string`            | —           | Directory of `.svelte` files addressable by basename, so plugins can emit `<YouTube />` freely.     |
| `headings`      | `boolean \| object` | `true`      | Stable heading ids plus `metadata.headings` for a table of contents. `{ levels: [2,3] }` narrows.   |
| `gfm`           | `boolean`           | `true`      | Tables, strikethrough, task lists, autolinks.                                                       |
| `math`          | `boolean \| object` | `true`      | LaTeX. An object overrides KaTeX options.                                                           |
| `remarkPlugins` | `PluggableList`     | `[]`        | Run after frontmatter/GFM/math, before conversion to HTML.                                          |
| `rehypePlugins` | `PluggableList`     | `[]`        | Run on the HTML tree **before** KaTeX, so plugins reading heading text see prose, not KaTeX markup. |
| `root`          | `string`            | Vite's root | What `components` resolves against.                                                                 |

Maths renders as **HTML and MathML** by default. HTML alone looks correct and is
completely silent to a screen reader, which makes maths-heavy writing unreadable
for anyone using one. Pass `math: { output: 'html' }` to opt out.

## Metadata

YAML frontmatter is parsed into `file.data.fm` and exported as `metadata`. Any
plugin may add to the same object, which is how a table of contents or a reading
time ends up on the export:

```js
export function remarkReadingTime() {
	return (tree, file) => {
		file.data.fm = { ...(file.data.fm ?? {}), readingTime: estimate(tree) };
	};
}
```

## Headings and tables of contents

Every heading gets an `id`, and all of them are collected onto
`metadata.headings`:

```js
{
  id: 'olog-n-logarithmic-complexity',
  level: 3,
  text: 'O(\\log n) - Logarithmic Complexity',    // maths as its LaTeX source
  html: '<span class="katex">…</span> - Logarithmic Complexity'
}
```

Two things this exists to get right, both easy to get wrong by hand.

**The id comes from the prose, not from KaTeX.** Collection runs _before_
KaTeX, so `### $O(\log n)$ - Logarithmic Complexity` slugifies from the LaTeX
source. Do it afterwards and the slug is built from `<span class="katex">…`,
which changes whenever KaTeX's output does — silently breaking every anchor
anyone has shared.

**One `slugify`, used on both sides.** A heading's `id` and a table of contents'
`href` are produced at different times, so a project that reimplements the slug
for its navigation keeps two copies that must agree forever. They will not.
Import the same function instead:

```js
import { slugify } from '@skavex/skavex';
```

`html` renders maths with the same KaTeX options as the body, so a formula
looks — and reads, to a screen reader — the same in the sidebar as in the text.

skavex owns `metadata.headings` while this is on. A project wanting its own
shape sets `headings: false` and writes a plugin.

## Writing a plugin that injects a component

Replace a node with an mdast `html` node and the component survives to the
compiler. `@skavex/skavex/utils` has the fiddly parts:

```js
import { componentNode, rawHtmlExpression, getBareLinkFromParagraph } from '@skavex/skavex/utils';
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

`rawHtmlExpression(html)` builds a `{@html ...}` expression with backticks and
`${` escaped — highlighted code contains both, and unescaped they break out of
the template literal.

With a `components` directory configured, nothing else is needed: skavex scans
it, sees `<YouTube` in the output, and emits the import.

## How it works

1. Vite `transform` on `.md`, `enforce: 'pre'` — before the Svelte plugin
2. Frontmatter → `<script module>export const metadata = …</script>`
3. unified: `remark-parse → frontmatter → gfm → math → your remark plugins → remark-rehype → your rehype plugins → katex → escape → rehype-stringify`
4. Brace escaping (below)
5. Wrap in the layout, import referenced components

### The brace problem

Svelte reads `{…}` in markup as an expression. Prose is full of braces —
`{arr[i]}` in a sentence, a code span, and above all KaTeX's MathML
`<annotation>`, which embeds the original LaTeX with every `\frac{a}{b}` intact.
Left alone, a post either fails to compile or quietly evaluates your prose.

skavex escapes braces in hast **`text`** nodes and leaves **`raw`** nodes alone:

- `text` → literal document content → escaped
- `raw` → markup a plugin injected on purpose → untouched

That split is the whole contract, and it is why plugins can still inject
components. Two details are load-bearing, and both are tested:

- The replacement is a `raw` node, not an edited `text` node. `rehype-stringify`
  escapes text on the way out, which would turn `&#123;` into `&#x26;#123;` and
  show the reader a literal entity.
- Escaping runs **after** KaTeX, or the annotation's braces are never seen.

## Development

```sh
nix develop       # node + pnpm, the same versions CI uses
pnpm install
pnpm test
pnpm lint
```

The suite asserts behaviour rather than snapshots: that braces survive as text,
that an unbalanced brace really is a Svelte parse error (so the escaping is
load-bearing), that KaTeX reaches the server-rendered HTML, and that generated
modules compile and render. `test/ssr.test.js` compiles documents all the way to
server-rendered HTML, components included.

## Licence

MIT
