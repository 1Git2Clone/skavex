/**
 * Turn a coverage summary into a shields.io endpoint document.
 *
 * Codecov and its equivalents need the repository to live on GitHub, GitLab or
 * Bitbucket. This one is on a self-hosted Forgejo instance, so the badge is
 * self-hosted too: the Pages workflow writes this file next to the demo, and
 * shields.io reads it back through its `endpoint` API. No third party sees the
 * repository, and there is nothing to keep in sync.
 *
 * Usage: node scripts/coverage-badge.js <output path>
 *
 * @module
 */

import { readFile, writeFile } from 'node:fs/promises';

/** Thresholds the colour changes at. Ordered high to low; the first match wins. */
const COLOURS = [
	[95, 'brightgreen'],
	[90, 'green'],
	[80, 'yellowgreen'],
	[70, 'yellow'],
	[0, 'red']
];

const [, , output] = process.argv;
if (!output) {
	console.error('usage: node scripts/coverage-badge.js <output path>');
	process.exit(1);
}

const summary = JSON.parse(await readFile('coverage/coverage-summary.json', 'utf8'));

// Lines rather than statements: it is the figure every other coverage badge
// reports, so this one means the same thing as the ones beside it.
const percentage = summary.total.lines.pct;
// The last threshold is 0, so a real percentage always matches — but `find`
// returns undefined for NaN, which is exactly what a malformed summary yields.
const band = COLOURS.find(([floor]) => percentage >= floor);
if (!band) throw new Error(`coverage summary gave no usable percentage (got ${percentage})`);
const colour = band[1];

await writeFile(
	output,
	JSON.stringify({
		schemaVersion: 1,
		label: 'coverage',
		message: `${percentage.toFixed(1)}%`,
		color: colour
	}) + '\n'
);

console.log(`coverage badge: ${percentage.toFixed(1)}% (${colour}) -> ${output}`);
