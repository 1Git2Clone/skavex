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
import { features, time } from './measure.js';

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
	// skavex was 1.13x the throughput of working mdsvex when this was written.
	// The floor is well under that: it is here to catch a pipeline change that
	// makes skavex materially slower than the alternative, not to defend a
	// number that was never the point.
	minSpeedRatioVsWorkingMdsvex: 0.9,

	// These are exact because they are deterministic. Each corresponds to
	// something that silently did not happen in a real project.
	skavex: {
		katex: 46,
		mathml: 16,
		headingIds: 3,
		escapesProse: true,
		keepsComponents: true,
		compiles: true
	}
};

/**
 * @returns {Promise<any>}
 */
async function measure() {
	const documents = corpus(DOCUMENTS);

	/** @type {any[]} */
	const results = [];

	for (const engine of ENGINES) {
		const output = await engine.compile(documents[0]);
		const timing = await time(engine, documents, SAMPLES);

		results.push({
			id: engine.id,
			label: engine.label,
			note: engine.note,
			...timing,
			features: features(output)
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
 * @param {any} report
 * @returns {string}
 */
function table(report) {
	const rows = report.results.map((/** @type {any} */ r) => {
		const f = r.features;
		return [
			r.label,
			`${r.msPerDoc.toFixed(2)} ms`,
			`${Math.round(r.docsPerSecond)}/s`,
			f.katex ? `yes (${f.katex})` : '**no**',
			f.mathml ? `yes (${f.mathml})` : '**no**',
			f.headingIds ? `yes (${f.headingIds})` : 'no',
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
		'Heading ids',
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
 * @param {any} report
 * @returns {string[]} One message per broken guarantee.
 */
function check(report) {
	/** @type {string[]} */
	const failures = [];

	/** @param {string} id */
	const find = (id) => report.results.find((/** @type {any} */ r) => r.id === id);

	const skavex = find('skavex');
	const working = find('mdsvex-legacy');

	for (const [key, expected] of Object.entries(GUARANTEES.skavex)) {
		const actual = skavex.features[key];
		// Counts may grow when the corpus or KaTeX's markup changes; they must
		// never shrink, which is what a silent failure looks like.
		const ok = typeof expected === 'number' ? actual >= expected : actual === expected;
		if (!ok) failures.push(`skavex.${key}: expected ${expected}, measured ${actual}`);
	}

	const ratio = working.msPerDoc / skavex.msPerDoc;
	if (ratio < GUARANTEES.minSpeedRatioVsWorkingMdsvex) {
		failures.push(
			`skavex throughput fell to ${ratio.toFixed(2)}x working mdsvex, ` +
				`floor is ${GUARANTEES.minSpeedRatioVsWorkingMdsvex}x`
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

if (process.argv.includes('--check')) {
	const failures = check(report);
	if (failures.length > 0) {
		console.error('\nRegressions:');
		for (const failure of failures) console.error(`  - ${failure}`);
		process.exit(1);
	}
	console.log('\nAll guarantees hold.');
}
