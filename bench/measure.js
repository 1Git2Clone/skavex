/**
 * Timing and capability measurement for one engine.
 *
 * @module
 */

import { compile as svelteCompile } from 'svelte/compiler';

/**
 * @typedef {Object} Features
 * @property {number} katex       KaTeX spans in the output. 0 means the maths silently did not render.
 * @property {number} mathml      MathML nodes — what a screen reader reads. 0 means the maths is invisible to one.
 * @property {number} headingIds  Headings given an id, i.e. anchors and a usable table of contents.
 * @property {boolean} escapesProse   Braces in prose neutralised for the Svelte compiler.
 * @property {boolean} keepsComponents A bare `<Counter />` tag survived into the output.
 * @property {boolean} compiles   The Svelte compiler accepts the result.
 */

/**
 * What the output actually contains, measured rather than claimed.
 *
 * @param {string} output Svelte component source.
 * @returns {Features}
 */
export function features(output) {
	const count = (/** @type {RegExp} */ pattern) => (output.match(pattern) ?? []).length;

	let compiles = false;
	try {
		svelteCompile(output, { name: 'Doc', generate: 'server' });
		compiles = true;
	} catch {
		// A failure is the measurement, not an error: a document whose prose the
		// engine left unescaped cannot be compiled, and that is the finding.
	}

	return {
		katex: count(/class="katex/g),
		mathml: count(/katex-mathml/g),
		headingIds: count(/<h[1-6] id=/g),
		escapesProse: output.includes('&#123;braces&#125;'),
		keepsComponents: /<Counter /.test(output),
		compiles
	};
}

/**
 * Median, which is what a shared CI runner calls for: one scheduling hiccup
 * moves a mean and leaves a median alone.
 *
 * @param {number[]} values
 * @returns {number}
 */
export function median(values) {
	const sorted = [...values].sort((a, b) => a - b);
	const middle = sorted.length >> 1;
	return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Time one engine over a corpus.
 *
 * Runs the whole corpus per sample and takes the median of the samples. A
 * warmup pass is discarded first, or the first sample would also be paying for
 * JIT compilation of a pipeline that runs thousands of times in a real build.
 *
 * @param {import('./engines.js').Engine} engine
 * @param {string[]} documents
 * @param {number} samples
 * @returns {Promise<{msPerDoc: number, docsPerSecond: number, bytes: number}>}
 */
export async function time(engine, documents, samples) {
	for (const source of documents) await engine.compile(source);

	/** @type {number[]} */
	const timings = [];
	let bytes = 0;

	for (let sample = 0; sample < samples; sample++) {
		const started = performance.now();
		for (const source of documents) bytes = (await engine.compile(source)).length;
		timings.push((performance.now() - started) / documents.length);
	}

	const msPerDoc = median(timings);
	return { msPerDoc, docsPerSecond: 1000 / msPerDoc, bytes };
}
