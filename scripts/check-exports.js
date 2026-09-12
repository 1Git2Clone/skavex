/**
 * Assert that every entry point package.json declares was actually emitted.
 *
 * Runs as the last step of `pnpm build`, which is where the declaration files
 * exist. A `types` path pointing at nothing is invisible: every export still
 * resolves at runtime, and the consumer silently falls back to implicit `any`
 * until someone turns on `strict` and wonders why the library is untyped.
 *
 * Deliberately not a unit test. The unit suite has to run without a build —
 * the Pages job runs it only to produce a coverage badge — so an assertion
 * about build output does not belong there.
 */

import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { exports: entries } = require('../package.json');

/** @type {string[]} */
const missing = [];

for (const [name, target] of Object.entries(entries)) {
	for (const [kind, path] of Object.entries(target)) {
		if (!existsSync(fileURLToPath(new URL(`../${path.replace('./', '')}`, import.meta.url)))) {
			missing.push(`${name} -> ${kind}: ${path}`);
		}
	}
}

if (missing.length > 0) {
	console.error('package.json declares entry points that were not emitted:');
	for (const line of missing) console.error(`  ${line}`);
	process.exit(1);
}

console.log(`All ${Object.keys(entries).length} entry points resolve to files that exist.`);
