/**
 * Timing and capability measurement for one engine.
 *
 * @module
 */

import { compile as svelteCompile } from 'svelte/compiler';

/**
 * @typedef {object} Features
 * @property {number} katex       KaTeX spans in the output. 0 means the maths silently did not render.
 * @property {number} mathml      MathML nodes — what a screen reader reads. 0 means the maths is invisible to one.
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
		escapesProse: output.includes('&#123;braces&#125;'),
		keepsComponents: /<Counter /.test(output),
		compiles
	};
}

/**
 * What one engine's timings came to.
 *
 * @typedef {object} Timing
 * @property {number} msPerDoc       Median milliseconds to compile one document.
 * @property {number} docsPerSecond  The same figure, inverted.
 * @property {number} bytes          Size of the last output produced.
 */

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
 * Time every engine over a corpus, interleaved.
 *
 * The interleaving is the point. Timing all of one engine's samples and then
 * all of the next means any drift in machine load lands entirely on whichever
 * engine happened to be running — and the ratio between them, which is the
 * only thing worth reporting, moves with it. Round-robin instead: sample one
 * of each engine, then sample two, so a busy moment is shared and the median
 * across samples sees through it.
 *
 * A warmup pass is discarded first, or the first sample would also be paying
 * for JIT compilation of a pipeline that runs thousands of times in a real
 * build.
 *
 * @param {import('./engines.js').Engine[]} engines
 * @param {string[]} documents
 * @param {number} samples
 * @returns {Promise<Map<string, Timing>>} One entry per engine, keyed by id.
 */
export async function timeAll(engines, documents, samples) {
	for (const engine of engines) {
		for (const source of documents) await engine.compile(source);
	}

	/** @type {Map<string, number[]>} */
	const timings = new Map(engines.map((engine) => [engine.id, []]));
	/** @type {Map<string, number>} */
	const sizes = new Map();

	for (let sample = 0; sample < samples; sample++) {
		for (const engine of engines) {
			const started = performance.now();
			let bytes = 0;
			for (const source of documents) bytes = (await engine.compile(source)).length;
			const samplesFor = timings.get(engine.id);
			// Seeded for every engine above, so this cannot happen — which is why it
			// should say so rather than be asserted away and resurface as a median
			// computed over nothing.
			if (!samplesFor) throw new Error(`no sample list for engine "${engine.id}"`);
			samplesFor.push((performance.now() - started) / documents.length);
			sizes.set(engine.id, bytes);
		}
	}

	return new Map(
		engines.map((engine) => {
			const samplesFor = timings.get(engine.id);
			if (!samplesFor) throw new Error(`no sample list for engine "${engine.id}"`);
			const msPerDoc = median(samplesFor);
			return [
				engine.id,
				{ msPerDoc, docsPerSecond: 1000 / msPerDoc, bytes: sizes.get(engine.id) ?? 0 }
			];
		})
	);
}
