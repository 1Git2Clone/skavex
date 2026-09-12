/**
 * The two unified plugins skavex cannot do without.
 *
 * Both are already in the pipeline `createProcessor` builds. They are exported
 * for the one case that needs them — assembling a processor by hand, when
 * `createProcessor` does not arrange things the way you need — and a project
 * using the Vite plugin never imports from here.
 *
 * There is nothing else, deliberately. skavex is unified 11 for server-rendered
 * Svelte, LaTeX and Markdown; a table of contents, a reading time, syntax
 * highlighting and everything else a document tree can be asked for are what
 * remark and rehype are for, and the ecosystem already has them. Anything
 * written for unified 11 works here unmodified, which is the point of being on
 * unified 11.
 *
 * Two orderings matter if you assemble the pipeline yourself. Anything reading
 * an element's text — `rehype-slug`, a table-of-contents collector — must run
 * BEFORE KaTeX, or it reads KaTeX's markup instead of the prose. And
 * `rehypeEscapeSvelteBraces` must run LAST, after every plugin that injects
 * markup, or it escapes braces belonging to a component tag. The `rehypePlugins`
 * option already sits between the two.
 *
 * @module
 */

export { remarkExtractFrontmatter } from './frontmatter.js';
export { rehypeEscapeSvelteBraces } from './escape.js';
