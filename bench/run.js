/**
 * The benchmark entry point.
 *
 * `node bench/run.js` prints a table and writes bench/results.json.
 * `node bench/run.js --check` additionally fails if a guarantee regressed,
 * which is what CI runs.
 *
 * @module
 */

import { writeFile } from 'node:fs/promises';
import { ENGINES } from './engines.js';
import { corpus } from './corpus.js';
import { features, timeAll } from './measure.js';

/** Documents per sample. Enough that per-document noise averages out. */
const DOCUMENTS = 20;

/** Samples to take the median of. */
const SAMPLES = 7;

/**
 * The gate.
 *
 * Absolute timings are deliberately absent. The CI runner shares a box with
 * mail, git and a minecraft server, so a millisecond threshold would fail on a
 * busy afternoon and tell nobody anything. What is asserted instead is a
 * ratio measured in the same process on the same machine within seconds of
 * itself, which survives a loaded box, plus the capabilities that are
 * deterministic and therefore safe to gate on exactly.
 */
const GUARANTEES = {
	// skavex and a working mdsvex sit at parity, trading places within about 15%
	// run to run. The floor is set below that band on purpose: it is here to
	// catch a change that makes skavex materially slower than the alternative,
	// not to defend a lead that is inside the noise either way.
	minSpeedRatioVsWorkingMdsvex: 0.9,

	// The bare pipeline is a floor rather than a rival: it escapes no prose,
	// resolves no components, and its output does not compile. skavex costs more
	// than it by design, and this is the number worth watching — the price of
	// those features, which should not quietly creep up.
	//
	// Measured across five runs at 1.29x to 1.37x, so the ceiling clears the top
	// of that range rather than sitting on it. A gate that a clean checkout
	// fails one time in five teaches people to rerun the job, not to read it.
	maxOverheadVsBarePipeline: 1.8,

	// These are exact because they are deterministic. Each corresponds to
	// something that silently did not happen in a real project.
	skavex: {
		katex: 46,
		// 15, not 16: the extra MathML block used to be a formula rendered a second
		// time into a table-of-contents entry, by a collector skavex no longer
		// ships. The bare pipeline emits 15 too, which is the point — skavex's
		// maths output is unified 11's maths output.
		mathml: 15,
		escapesProse: true,
		keepsComponents: true,
		compiles: true
	}
};

/**
 * One engine's row in the report.
 *
 * @typedef {object} EngineResult
 * @property {string} id                                 Stable key, as in engines.js.
 * @property {string} label                              How the table names it.
 * @property {string} note                               What a reader needs to read its numbers.
 * @property {number} msPerDoc                           Median milliseconds per document.
 * @property {number} docsPerSecond                      The same figure, inverted.
 * @property {number} bytes                              Size of the output produced.
 * @property {import('./measure.js').Features} features  What that output contains.
 */

/**
 * The whole run, as written to results.json.
 *
 * @typedef {object} Report
 * @property {string} generatedAt        ISO timestamp.
 * @property {string} node               The node version that produced it.
 * @property {number} documents          Documents per sample.
 * @property {number} samples            Samples taken.
 * @property {EngineResult[]} results    One per engine, in the order engines.js lists them.
 */

/**
 * Run every engine and collect what it did.
 *
 * @returns {Promise<Report>} The measurements.
 */
async function measure() {
	const documents = corpus(DOCUMENTS);
	const timings = await timeAll(ENGINES, documents, SAMPLES);

	/** @type {EngineResult[]} */
	const results = [];

	for (const engine of ENGINES) {
		const timing = timings.get(engine.id);
		// Cannot happen while timeAll is given these engines, which is exactly why
		// it should say so loudly rather than spread `undefined` into the row and
		// surface as NaN three functions later.
		if (!timing) throw new Error(`no timing recorded for engine "${engine.id}"`);

		results.push({
			id: engine.id,
			label: engine.label,
			note: engine.note,
			...timing,
			features: features(await engine.compile(documents[0]))
		});
	}

	return {
		generatedAt: new Date().toISOString(),
		node: process.version,
		documents: DOCUMENTS,
		samples: SAMPLES,
		results
	};
}

/**
 * Render the report as a markdown table.
 *
 * @param {Report} report The measurements.
 * @returns {string} A markdown table, ready to paste into BENCHMARKS.md.
 */
function table(report) {
	const rows = report.results.map((result) => {
		const f = result.features;
		return [
			result.label,
			`${result.msPerDoc.toFixed(2)} ms`,
			`${Math.round(result.docsPerSecond)}/s`,
			f.katex ? `yes (${f.katex})` : '**no**',
			f.mathml ? `yes (${f.mathml})` : '**no**',
			f.escapesProse ? 'yes' : 'no',
			f.keepsComponents ? 'yes' : 'no',
			f.compiles ? 'yes' : '**no**'
		];
	});

	const header = [
		'Engine',
		'Per doc',
		'Throughput',
		'KaTeX',
		'MathML',
		'Escapes prose',
		'Keeps components',
		'Compiles'
	];

	const lines = [
		`| ${header.join(' | ')} |`,
		`| ${header.map(() => '---').join(' | ')} |`,
		...rows.map((/** @type {string[]} */ cells) => `| ${cells.join(' | ')} |`)
	];

	return lines.join('\n');
}

/**
 * Compare a report against the guarantees.
 *
 * @param {Report} report The measurements.
 * @returns {string[]} One message per broken guarantee.
 */
function check(report) {
	/** @type {string[]} */
	const failures = [];

	/**
	 * Find an engine's row, or say which one is missing.
	 *
	 * @param {string} id
	 * @returns {EngineResult}
	 */
	const find = (id) => {
		const result = report.results.find((candidate) => candidate.id === id);
		if (!result) throw new Error(`the benchmark did not measure "${id}"`);
		return result;
	};

	const skavex = find('skavex');
	const working = find('mdsvex-legacy');
	const bare = find('bare');

	for (const [key, expected] of Object.entries(GUARANTEES.skavex)) {
		const actual = skavex.features[/** @type {keyof import('./measure.js').Features} */ (key)];

		// A guarantee and its measurement have to be the same kind of thing.
		// Coercing instead — which is what `Number(actual)` did here until it was
		// caught — turns `true` into 1 and reports a bogus threshold failure
		// rather than the mismatch that actually happened.
		if (typeof expected !== typeof actual) {
			failures.push(
				`skavex.${key}: the guarantee is a ${typeof expected} but the ` +
					`measurement is a ${typeof actual}`
			);
			continue;
		}

		// Counts may grow when the corpus or KaTeX's markup changes; they must
		// never shrink, which is what a silent failure looks like.
		const ok =
			typeof expected === 'number' && typeof actual === 'number'
				? actual >= expected
				: actual === expected;
		if (!ok) failures.push(`skavex.${key}: expected ${expected}, measured ${actual}`);
	}

	const ratio = working.msPerDoc / skavex.msPerDoc;
	if (ratio < GUARANTEES.minSpeedRatioVsWorkingMdsvex) {
		failures.push(
			`skavex throughput fell to ${ratio.toFixed(2)}x working mdsvex, ` +
				`floor is ${GUARANTEES.minSpeedRatioVsWorkingMdsvex}x`
		);
	}

	const overhead = skavex.msPerDoc / bare.msPerDoc;
	if (overhead > GUARANTEES.maxOverheadVsBarePipeline) {
		failures.push(
			`skavex now costs ${overhead.toFixed(2)}x the bare unified pipeline, ` +
				`ceiling is ${GUARANTEES.maxOverheadVsBarePipeline}x`
		);
	}

	return failures;
}

const report = await measure();
await writeFile(
	new URL('results.json', import.meta.url),
	JSON.stringify(report, null, '\t') + '\n'
);

console.log(table(report));
console.log(
	`\nnode ${report.node}, ${report.documents} documents, median of ${report.samples} samples`
);

const skavexResult = report.results.find((result) => result.id === 'skavex');
const bareResult = report.results.find((result) => result.id === 'bare');
if (skavexResult && bareResult) {
	console.log(
		`skavex costs ${(skavexResult.msPerDoc / bareResult.msPerDoc).toFixed(2)}x the bare ` +
			`pipeline, for escaped prose, resolved components and output that compiles.`
	);
}

if (process.argv.includes('--check')) {
	const failures = check(report);
	if (failures.length > 0) {
		console.error('\nRegressions:');
		for (const failure of failures) console.error(`  - ${failure}`);
		process.exit(1);
	}
	console.log('\nAll guarantees hold.');
}
