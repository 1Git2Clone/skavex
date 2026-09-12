/**
 * The engines under comparison, behind one interface.
 *
 * Each takes markdown and returns Svelte component source, which is what both
 * libraries are for — so the comparison is of the same job, not of two
 * different ones.
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

import { compile as mdsvexCompile } from 'mdsvex';
import remarkMathModern from 'remark-math';
import rehypeKatexModern from 'rehype-katex';
import remarkMathLegacy from 'remark-math-legacy';
import rehypeKatexLegacy from 'rehype-katex-legacy';
import { compile as skavexCompile } from '../src/index.js';

/**
 * @typedef {Object} Engine
 * @property {string} id      Stable key used in results.json.
 * @property {string} label   How the comparison table names it.
 * @property {string} note    What a reader needs to know to read its numbers.
 * @property {(source: string) => Promise<string>} compile Markdown in, Svelte source out.
 */

/** @type {Engine[]} */
export const ENGINES = [
	{
		id: 'skavex',
		label: 'skavex',
		note: 'unified 11, KaTeX at build time',
		compile: async (source) => (await skavexCompile(source)).code
	},
	{
		id: 'mdsvex-legacy',
		label: 'mdsvex + remark-math 3',
		note: 'the newest maths plugins mdsvex can actually run',
		compile: async (source) =>
			(
				await mdsvexCompile(source, {
					remarkPlugins: [remarkMathLegacy],
					rehypePlugins: [rehypeKatexLegacy]
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
					remarkPlugins: [remarkMathModern],
					rehypePlugins: [rehypeKatexModern]
				})
			)?.code ?? ''
	}
];
