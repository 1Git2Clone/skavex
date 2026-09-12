# Options reference

Every option of the Vite plugin and of `compile`.

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

`math` and `headings` take an object to narrow them:

```js
skavex({
	// Only h2 and h3 get ids and appear in metadata.headings.
	headings: { levels: [2, 3] },
	// KaTeX options; see https://katex.org/docs/options
	math: { output: 'mathml', macros: { '\\R': '\\mathbb{R}' } }
});
```

Setting `math: false` leaves LaTeX untouched, which is the way to order KaTeX
yourself through `rehypePlugins` — for instance to run it after a plugin that
rewrites formulas.

## Exports

| Specifier                | Exports                                                                                                                                                                                                                                            |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@skavex/skavex`         | `compile`, `render`, `createProcessor`, `buildModule`, `slugify`, `escapeText`, `rehypeEscapeSvelteBraces`, `rehypeHeadings`, `remarkExtractFrontmatter`, `findComponents`, `selectUsedComponents`, `referencedComponents`, `resolveComponentsDir` |
| `@skavex/skavex/vite`    | `skavex`                                                                                                                                                                                                                                           |
| `@skavex/skavex/browser` | `render`, `createProcessor`, `buildModule`, `selectUsedComponents`, `referencedComponents`, `LAYOUT_IDENTIFIER` — everything above that does not touch the filesystem                                                                              |
| `@skavex/skavex/utils`   | `componentNode`, `rawHtmlExpression`, `escapeTemplateLiteral`, `getBareLinkFromParagraph`                                                                                                                                                          |

`compile` and `findComponents` are the only things that read from disk, which
is the whole difference between the main entry and `/browser`.
