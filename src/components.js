import { readdir } from 'node:fs/promises';
import path from 'node:path';

// Kept re-exported from here because it is half of this module's job from a
// caller's point of view; it lives in browser.js because it is pure string
// work and the live preview needs it without dragging node:fs along.
export { selectUsedComponents, referencedComponents } from './browser.js';

/** @typedef {import('./browser.js').DiscoveredComponent} DiscoveredComponent */

/**
 * Filesystem paths a configured directory might mean, in preference order.
 *
 * A leading `/` is ambiguous. Vite reads it as "from the project root", which
 * is how it will resolve the import specifiers this module emits, so that
 * reading is tried first. But a caller outside Vite — a test, a script — may
 * reasonably pass a real absolute path, so that is tried second rather than
 * rejected. Trying both beats guessing from the prefix.
 *
 * @param {string} dir  Directory as the caller configured it.
 * @param {string} root Project root to resolve against.
 * @returns {string[]} Candidate absolute paths, most likely first.
 */
export function resolveComponentsDir(dir, root) {
	if (!path.isAbsolute(dir)) return [path.resolve(root, dir)];
	return [path.resolve(root, dir.replace(/^\//, '')), dir];
}

/**
 * Is this the error `readdir` throws for a directory that is not there?
 *
 * A type guard rather than a cast: a caught value really is `unknown`, and the
 * only shape worth recognising is the one this function is allowed to ignore.
 * Anything else has to keep propagating.
 *
 * @param {unknown} error Whatever was caught.
 * @returns {boolean} True when it is ENOENT and may be ignored.
 */
function isMissingDirectory(error) {
	return (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		/** @type {{code: unknown}} */ (error).code === 'ENOENT'
	);
}

/**
 * Find every Svelte component under a directory, recursively.
 *
 * The component's NAME is its basename, so `md/embeds/YouTube.svelte` is
 * written `<YouTube />` regardless of how deeply it is nested. Two files with
 * the same basename are therefore ambiguous; the first one found wins and the
 * duplicate is reported so the caller can warn rather than silently bind the
 * wrong component.
 *
 * A missing directory yields no components rather than throwing: a project may
 * legitimately configure one before creating it.
 *
 * @param {string} dir  Directory as configured (used to build import specifiers).
 * @param {string} root Project root to resolve `dir` against.
 * @returns {Promise<{components: DiscoveredComponent[], duplicates: string[]}>} Every
 *   component found, and the basenames that appeared more than once.
 */
export async function findComponents(dir, root) {
	/** @type {import('node:fs').Dirent[] | undefined} */
	let entries;
	/** @type {string | undefined} */
	let absolute;

	for (const candidate of resolveComponentsDir(dir, root)) {
		try {
			entries = await readdir(candidate, { withFileTypes: true, recursive: true });
			absolute = candidate;
			break;
		} catch (error) {
			// `error` is unknown, as it should be — anything can be thrown. Narrow
			// to the one case worth swallowing rather than asserting a shape.
			if (isMissingDirectory(error)) continue;
			throw error;
		}
	}

	// A project may configure a directory before creating it; that is not an
	// error, it simply contributes no components.
	if (entries === undefined || absolute === undefined) return { components: [], duplicates: [] };

	/** @type {Map<string, DiscoveredComponent>} */
	const byName = new Map();
	/** @type {string[]} */
	const duplicates = [];

	for (const entry of entries) {
		if (!entry.isFile() || !entry.name.endsWith('.svelte')) continue;

		const name = entry.name.slice(0, -'.svelte'.length);
		if (!/^[A-Z][A-Za-z0-9_]*$/.test(name)) continue;

		if (byName.has(name)) {
			duplicates.push(name);
			continue;
		}

		// `entry.parentPath` is absolute; re-express it relative to the scanned
		// directory so the emitted specifier keeps the caller's own spelling and
		// Vite resolves it the same way it resolves the configured value.
		const parent = entry.parentPath ?? absolute;
		const nested = path.relative(absolute, parent);
		const specifier = [
			dir.replace(/\/$/, ''),
			...(nested ? nested.split(path.sep) : []),
			entry.name
		]
			.join('/')
			.replace(/\\/g, '/');

		byName.set(name, { name, specifier });
	}

	return { components: [...byName.values()], duplicates };
}
