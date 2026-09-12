/**
 * skavex — server-rendered Markdown + LaTeX for Svelte.
 *
 * Two functions, and most projects use one of them indirectly: the Vite plugin
 * at `@skavex/skavex/vite` is what a site actually configures, and it calls
 * `compile` for you.
 *
 * The rest of the library is deliberately behind its own entry points rather
 * than here, so that this list stays readable and so that what is API is
 * distinguishable from what is merely exported:
 *
 * - `@skavex/skavex/vite` — the Vite plugin.
 * - `@skavex/skavex/browser` — the same pipeline with nothing that touches the
 *   filesystem, for a live preview, a worker or an edge runtime.
 * - `@skavex/skavex/plugins` — the two plugins the pipeline cannot do without,
 *   for assembling a processor by hand.
 * - `@skavex/skavex/utils` — helpers for writing a plugin that injects a
 *   component.
 *
 * @module
 */

export { compile } from './compile.js';
export { render } from './browser.js';

/**
 * @typedef {import('./browser.js').SkavexOptions} SkavexOptions
 * @typedef {import('./browser.js').DocumentMetadata} DocumentMetadata
 */
