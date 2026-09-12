/**
 * The unified plugins skavex ships.
 *
 * Two of these the pipeline always runs — `remarkExtractFrontmatter` and
 * `rehypeEscapeSvelteBraces` — because a document would not survive without
 * them. They are exported for the case where `createProcessor` does not arrange
 * things the way you need and you are assembling a pipeline by hand.
 *
 * `rehypeHeadings` is the other kind: an optional plugin, off unless you ask
 * for it, that derives one particular thing from the document and merges it
 * into the metadata. Nothing distinguishes it from a plugin you write yourself
 * except that it is here — see `@skavex/skavex/utils` for `setMetadata`, which
 * is the whole of what it uses to contribute.
 *
 * ```js
 * import { rehypeHeadings } from '@skavex/skavex/plugins';
 *
 * skavex({ rehypePlugins: [rehypeHeadings] });
 * ```
 *
 * Two orderings matter if you assemble the pipeline yourself:
 * `rehypeHeadings`, and anything else reading an element's text, must run
 * BEFORE KaTeX — afterwards the text is KaTeX's markup rather than the prose —
 * and `rehypeEscapeSvelteBraces` must run LAST, after every plugin that injects
 * markup, or it escapes braces belonging to a component tag. The `rehypePlugins`
 * option already sits between the two.
 *
 * @module
 */

export { rehypeHeadings } from './headings.js';
export { remarkExtractFrontmatter } from './frontmatter.js';
export { rehypeEscapeSvelteBraces } from './escape.js';

/** @typedef {import('./headings.js').HeadingEntry} HeadingEntry */
