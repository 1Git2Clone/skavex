# skavex

[![CI Icon]][CI Status]&emsp;[![Coverage Icon]][Coverage Status]&emsp;[![npm Icon]][npm Status]&emsp;[![Docs Icon]][Docs]&emsp;[![Demo Icon]][Demo]&emsp;[![License Icon]][License]

[CI Icon]: https://git.hu-tao.dev/skavex/skavex/badges/workflows/ci.yml/badge.svg
[CI Status]: https://git.hu-tao.dev/skavex/skavex/actions
[Coverage Icon]: https://img.shields.io/endpoint?url=https%3A%2F%2Fpages.hu-tao.dev%2Fskavex%2Fskavex%2Fcoverage.json
[Coverage Status]: https://pages.hu-tao.dev/skavex/skavex/coverage/
[npm Icon]: https://img.shields.io/npm/v/@skavex/skavex
[npm Status]: https://www.npmjs.com/package/@skavex/skavex
[Docs Icon]: https://img.shields.io/badge/docs-book-7aa2f7
[Docs]: https://pages.hu-tao.dev/skavex/skavex/docs/
[Demo Icon]: https://img.shields.io/badge/demo-live-7aa2f7
[Demo]: https://pages.hu-tao.dev/skavex/skavex/
[License Icon]: https://img.shields.io/badge/license-MIT-blue.svg
[License]: https://git.hu-tao.dev/skavex/skavex/src/branch/main/LICENSE

**Server-rendered Markdown + LaTeX for Svelte.** A Vite plugin that compiles
`.md` files into real Svelte components — so your posts are HTML on first paint,
with no markdown parser in the bundle, no maths rendering on the main thread,
and nothing a crawler has to run JavaScript to see.

**[Documentation](https://pages.hu-tao.dev/skavex/skavex/docs/)** ·
**[Playground](https://pages.hu-tao.dev/skavex/skavex/)**

This README is the tour. The book goes further: component children and
indentation, writing plugins, server versus client rendering, the full options
reference, and a measured comparison with mdsvex.

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
mdsvex + remark-math 3   46 formulas rendered
mdsvex + remark-math 6    0 formulas rendered   <- no error, no warning
```

There is nothing to search for and nothing in a stack trace. If you have ever
lost a day to that, this library is the way out: it owns the pipeline, so the
unified version is yours to choose.

## How it compares

Measured, not claimed — `pnpm bench` regenerates every number and CI fails if
one regresses. Full method in
[BENCHMARKS.md](https://git.hu-tao.dev/skavex/skavex/src/branch/main/BENCHMARKS.md).

|                                 | skavex  | hand-rolled unified 11 | mdsvex + math 3 | mdsvex + math 6 |
| ------------------------------- | ------- | ---------------------- | --------------- | --------------- |
| Formulas rendered               | 46      | 46                     | 46              | **0**           |
| Heading ids and TOC data        | yes     | no                     | no              | no              |
| Escapes prose, keeps components | yes     | no                     | no              | no              |
| Output compiles as Svelte       | yes     | **no**                 | **no**          | **no**          |
| Per document                    | 8.62 ms | 6.83 ms                | 9.31 ms         | 3.10 ms         |

**Against the only mdsvex that renders maths, skavex is a little quicker** —
and across repeated runs the two trade places within about 15%, which is noise.
Nobody should choose a markdown engine on that; the point is that the feature
list below costs nothing in throughput.

The hand-rolled column is a floor, not an alternative. It is the same unified
11 pipeline with none of the work below, and **its output does not compile**.
The 1.26× between them is what that work costs. And `remark-math 6` is not
fast, it is _empty_ — that column is the price of skipping every formula.

What you are actually choosing is these four, which you would otherwise write
and maintain yourself:

- **Braces escaped in prose, untouched in components.** Without it the output
  is not valid Svelte — every row above except skavex fails to compile on
  prose containing `{braces}`. mdsvex expects you to escape them by hand, in
  every document.
- **Components injected by tag**, from a directory, so a plugin can emit
  `<YouTube />` without arranging imports.
- **Heading ids and table-of-contents data**, derived from prose _before_
  KaTeX runs, so an id never changes when KaTeX changes its markup — and with
  the maths rendered, so navigation is not full of raw LaTeX.
- **A unified version you choose.** mdsvex pins unified 8.4.2 (2020), so its
  maths only works with `remark-math@3`. Pair it with the current one and it
  compiles cleanly and emits **no maths at all** — no error, no warning,
  nothing to search for.

That last one is why this exists.

### Server-rendering matters more than any of it

|                                    | CLS   | JavaScript | Lighthouse |
| ---------------------------------- | ----- | ---------- | ---------- |
| skavex — maths in the HTML         | 0.006 | 0 kB       | 96         |
| mdsvex + math 3 — also in the HTML | 0.006 | 0 kB       | 95         |
| client-side KaTeX                  | 0.246 | 270 kB     | 84         |

Read that honestly, in two parts.

**skavex and mdsvex are identical here**, because both render at build time.
The third row is what a project ends up with after the maths silently fails and
someone patches it with KaTeX's auto-render script.

**The JavaScript column is the durable one.** 270 kB against nothing is a count
of bytes, the same on every machine. The CLS column is not: these are
workstation numbers, and on the CI runner — whose container has one font, so
the KaTeX faces land after first paint — the ordering reverses, with the
client-rendered page measuring _better_ than the server-rendered ones.
[BENCHMARKS.md](https://git.hu-tao.dev/skavex/skavex/src/branch/main/BENCHMARKS.md)
has both sets of numbers and why they disagree.

## Install

```sh
pnpm add -D @skavex/skavex
```

Also published to this instance's own registry at the same version — see
[installing from the Forgejo registry](https://pages.hu-tao.dev/skavex/skavex/docs/getting-started.html#installing-from-the-forgejo-registry).

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

| Option          | Type                | Default     | Meaning                                                                                                                                 |
| --------------- | ------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `extensions`    | `string[]`          | `['.md']`   | Which files are documents.                                                                                                              |
| `layout`        | `string`            | —           | Component wrapping every document. Gets the metadata as props; the body is its `children`.                                              |
| `components`    | `string`            | —           | Directory of `.svelte` files addressable by basename, so plugins can emit `<YouTube />` freely.                                         |
| `gfm`           | `boolean`           | `true`      | Tables, strikethrough, task lists, autolinks.                                                                                           |
| `math`          | `boolean \| object` | `true`      | LaTeX. An object overrides KaTeX options.                                                                                               |
| `remarkPlugins` | `PluggableList`     | `[]`        | Run after frontmatter/GFM/math, before conversion to HTML.                                                                              |
| `rehypePlugins` | `PluggableList`     | `[]`        | Run on the HTML tree **before** KaTeX, so a plugin reading element text sees prose, not KaTeX markup. Where metadata collectors belong. |
| `root`          | `string`            | Vite's root | What `components` resolves against.                                                                                                     |

Maths renders as **HTML and MathML** by default. HTML alone looks correct and is
completely silent to a screen reader, which makes maths-heavy writing unreadable
for anyone using one. Pass `math: { output: 'html' }` to opt out.

Going the other way is worth knowing about: `math: { output: 'mathml' }` drops
KaTeX's HTML and leaves only the MathML, which every current browser renders
natively. On the benchmark corpus that is **half the build time and a quarter
of the page weight** — 5.7 kB against 21 kB of HTML. It is not the default
because KaTeX's HTML looks the same regardless of which maths fonts a reader
has, but for a maths-heavy site it is the first thing to try.

## Metadata

`metadata` is an open object, and skavex puts nothing of its own in it. YAML
frontmatter is one contributor; a plugin is another. What a document exports is
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

## Contributing

Development happens on **[git.hu-tao.dev](https://git.hu-tao.dev/skavex/skavex)**;
GitHub is a push-only mirror whose commits do not survive the next mirror push.
Registration on the instance is closed, so opening an issue or a pull request
takes an account or an emailed patch — [CONTRIBUTING.md](CONTRIBUTING.md) has
both routes, and what the checks expect.

## Development

```sh
nix develop          # node, pnpm and browsers, the same versions CI uses
pnpm install
pnpm test            # unit suite
pnpm test:coverage   # with thresholds enforced
pnpm test:e2e        # the demo, driven in a real browser
pnpm bench           # comparison against mdsvex
pnpm demo            # the editor, locally
```

`any` is banned. Not discouraged — banned, by `jsdoc/reject-any-type` and
`jsdoc/check-types`, in source, tests, benchmarks and components alike, because
the JSDoc here is not documentation that might drift from the types: it **is**
the type declaration shipped to consumers, and one `any` disables every check
the rest of the config exists to perform. Where a value genuinely is not known,
`unknown` says so and forces the narrowing that `any` skips.

`pnpm check` runs three passes: the declaration build over `src/`, a no-emit
pass over everything else, and `svelte-check` over the demo.

The suite asserts behaviour rather than snapshots: that braces survive as text,
that an unbalanced brace really is a Svelte parse error (so the escaping is
load-bearing), that KaTeX reaches the server-rendered HTML, and that generated
modules compile and render. `test/ssr.test.js` compiles documents all the way to
server-rendered HTML, components included.

## Licence

MIT
