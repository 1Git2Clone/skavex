/**
 * The engines under comparison, behind one interface.
 *
 * Each takes markdown and returns Svelte component source, which is what both
 * libraries are for — so the comparison is of the same job, not of two
 * different ones.
 *
 * The bare pipeline is here because it is the honest alternative: anyone
 * capable of choosing a markdown engine can wire remark and rehype together in
 * twenty lines, and that is the thing skavex has to justify itself against.
 * Being faster than it would be suspicious — skavex IS that pipeline, plus the
 * work that makes its output usable as Svelte.
 *
 * mdsvex appears twice on purpose. It pins unified 8.4.2, and the remark and
 * rehype ecosystem moved to unified 11 years ago. Pairing it with today's
 * remark-math produces a document with no maths in it and no error of any
 * kind, so measuring only that configuration would be unfair in mdsvex's
 * favour on speed and unfair against it on capability. The legacy pairing is
 * what mdsvex can actually do.
 *
 * @module
 */

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import { compile as mdsvexCompile } from 'mdsvex';
import remarkMathModern from 'remark-math';
import rehypeKatexModern from 'rehype-katex';
import remarkMathLegacy from 'remark-math-legacy';
import rehypeKatexLegacy from 'rehype-katex-legacy';
import { compile as skavexCompile } from '../src/index.js';

/**
 * @typedef {object} Engine
 * @property {string} id      Stable key used in results.json.
 * @property {string} label   How the comparison table names it.
 * @property {string} note    What a reader needs to know to read its numbers.
 * @property {(source: string) => Promise<string>} compile Markdown in, Svelte source out.
 */

/**
 * Hand a plugin to mdsvex.
 *
 * mdsvex's types come from the unified 8 it bundles, so a plugin built against
 * unified 11 is not assignable to them — the compiler is describing exactly
 * the incompatibility this benchmark exists to measure. The cast is where that
 * is stated out loud rather than smuggled in as `any`, and it is confined to
 * this one function so nothing else in the file can quietly do the same.
 *
 * @param {unknown} plugin A remark or rehype plugin of any vintage.
 * @returns {import('mdsvex').MdsvexOptions['remarkPlugins']} A list mdsvex accepts.
 */
function forMdsvex(plugin) {
	return /** @type {import('mdsvex').MdsvexOptions['remarkPlugins']} */ ([plugin]);
}

/** @type {Engine[]} */
export const ENGINES = [
	{
		id: 'skavex',
		label: 'skavex',
		note: 'unified 11, KaTeX at build time',
		compile: async (source) => (await skavexCompile(source)).code
	},
	{
		id: 'bare',
		label: 'hand-rolled unified 11',
		note: 'the same modern pipeline, wired by hand, doing none of the extra work',
		compile: async (source) =>
			String(
				await unified()
					.use(remarkParse)
					.use(remarkFrontmatter, ['yaml'])
					.use(remarkGfm)
					.use(remarkMathModern)
					.use(remarkRehype, { allowDangerousHtml: true })
					.use(rehypeKatexModern)
					.use(rehypeStringify, { allowDangerousHtml: true })
					.process(source)
			)
	},
	{
		id: 'mdsvex-legacy',
		label: 'mdsvex + remark-math 3',
		note: 'the newest maths plugins mdsvex can actually run',
		compile: async (source) =>
			(
				await mdsvexCompile(source, {
					remarkPlugins: forMdsvex(remarkMathLegacy),
					rehypePlugins: forMdsvex(rehypeKatexLegacy)
				})
			)?.code ?? ''
	},
	{
		id: 'mdsvex-modern',
		label: 'mdsvex + remark-math 6',
		note: 'what a new project gets by installing current versions',
		compile: async (source) =>
			(
				await mdsvexCompile(source, {
					remarkPlugins: forMdsvex(remarkMathModern),
					rehypePlugins: forMdsvex(rehypeKatexModern)
				})
			)?.code ?? ''
	}
];
