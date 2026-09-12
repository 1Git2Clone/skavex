/**
 * skavex — server-rendered Markdown + LaTeX for Svelte.
 *
 * The core API. Most projects only need the Vite plugin from
 * `@skavex/skavex/vite`; these exports are for rendering documents outside a
 * Vite build — a feed, a search index, a test.
 *
 * @module
 */

export { compile, render, createProcessor, buildModule } from './compile.js';
export { rehypeEscapeSvelteBraces, escapeText } from './escape.js';
export { remarkExtractFrontmatter } from './frontmatter.js';
export { findComponents, selectUsedComponents, resolveComponentsDir } from './components.js';

/**
 * @typedef {import('./compile.js').SkavexOptions} SkavexOptions
 * @typedef {import('./components.js').DiscoveredComponent} DiscoveredComponent
 */
