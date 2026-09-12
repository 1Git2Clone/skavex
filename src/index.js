/**
 * skavex — server-rendered Markdown + LaTeX for Svelte.
 *
 * The core API. Most projects only need the Vite plugin from
 * `@skavex/skavex/vite`; these exports are for rendering documents outside a
 * Vite build — a feed, a search index, a test.
 *
 * @module
 */

export { compile } from './compile.js';
export { render, createProcessor, buildModule } from './browser.js';
export { rehypeEscapeSvelteBraces, escapeText } from './escape.js';
export { remarkExtractFrontmatter } from './frontmatter.js';
export { rehypeHeadings } from './headings.js';
export { slugify } from './slug.js';
export { findComponents, selectUsedComponents, resolveComponentsDir } from './components.js';

/**
 * @typedef {import('./browser.js').SkavexOptions} SkavexOptions
 * @typedef {import('./browser.js').DocumentMetadata} DocumentMetadata
 * @typedef {import('./components.js').DiscoveredComponent} DiscoveredComponent
 * @typedef {import('./headings.js').HeadingEntry} HeadingEntry
 */
