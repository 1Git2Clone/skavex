/**
 * The unified plugins skavex is built from.
 *
 * A separate entry point because these are for one job: assembling a pipeline
 * by hand, when {@link import('./browser.js').createProcessor} does not arrange
 * things the way you need. Most projects never import from here — the Vite
 * plugin and `compile` already run all three in the order they have to run in,
 * and that order is the awkward part.
 *
 * If you do build your own: `rehypeHeadings` must run BEFORE KaTeX, or ids are
 * derived from KaTeX's markup instead of the prose, and
 * `rehypeEscapeSvelteBraces` must run LAST, after every plugin that injects
 * markup, or it will escape braces belonging to a component tag.
 *
 * @module
 */

export { rehypeHeadings } from './headings.js';
export { remarkExtractFrontmatter } from './frontmatter.js';
export { rehypeEscapeSvelteBraces } from './escape.js';

/** @typedef {import('./headings.js').HeadingEntry} HeadingEntry */
