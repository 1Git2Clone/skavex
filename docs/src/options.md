# Options reference

Every option of the Vite plugin and of `compile`.

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

`math` takes an object to configure KaTeX:

```js
skavex({
	// KaTeX options; see https://katex.org/docs/options
	math: { output: 'mathml', macros: { '\\R': '\\mathbb{R}' } }
});
```

There is no option for headings, a table of contents, a reading time or
anything else derived from the document. Those are plugins, and they go in
`remarkPlugins` or `rehypePlugins` — see [Documents](documents.md#metadata).

Setting `math: false` leaves LaTeX untouched, which is the way to order KaTeX
yourself through `rehypePlugins` — for instance to run it after a plugin that
rewrites formulas.

## Exports

Five entry points, tiered by how close to the library's internals you need to
get. Most projects use the first two and never the rest.

| Specifier                | Exports                                                                                                         | For                                                             |
| ------------------------ | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `@skavex/skavex/vite`    | `skavex`                                                                                                        | What a site configures.                                         |
| `@skavex/skavex`         | `compile`, `render`, `slugify`                                                                                  | Rendering a document outside a Vite build.                      |
| `@skavex/skavex/browser` | `render`, `createProcessor`, `buildModule`, `selectUsedComponents`, `referencedComponents`, `LAYOUT_IDENTIFIER` | A live preview, a worker, an edge runtime.                      |
| `@skavex/skavex/plugins` | `rehypeHeadings`, `remarkExtractFrontmatter`, `rehypeEscapeSvelteBraces`                                        | Assembling a pipeline by hand.                                  |
| `@skavex/skavex/utils`   | `setMetadata`, `componentNode`, `rawHtmlExpression`, `escapeTemplateLiteral`, `getBareLinkFromParagraph`        | Writing a plugin: contributing metadata, injecting a component. |

`compile` is the only thing here that reads from disk, which is the whole
difference between the main entry and `/browser`.

If you assemble a pipeline from `/plugins` yourself, two orderings are not
optional: `rehypeHeadings` runs **before** KaTeX, or ids come from KaTeX's
markup instead of the prose, and `rehypeEscapeSvelteBraces` runs **last**, after
everything that injects markup, or it escapes braces belonging to a component
tag.
