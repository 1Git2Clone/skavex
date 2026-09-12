import { readdir } from 'node:fs/promises';
import path from 'node:path';

/**
 * A Svelte component discovered in the components directory.
 *
 * @typedef {object} DiscoveredComponent
 * @property {string} name       Tag name as markup must spell it, e.g. `YouTube`.
 * @property {string} specifier  Import specifier to emit, e.g. `/src/lib/md/YouTube.svelte`.
 */

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

/**
 * Select the components a document actually references.
 *
 * Only capitalised tags can be components in Svelte, and by the time this runs
 * any `<` that was literal document text has already been escaped to `&lt;` by
 * {@link import('./escape.js').rehypeEscapeSvelteBraces}. So a bare `<Name` in
 * the HTML is markup a plugin injected on purpose, never prose or a fenced code
 * sample that merely looks like one.
 *
 * @param {string} html Stringified document markup.
 * @param {DiscoveredComponent[]} available Components found on disk.
 * @returns {DiscoveredComponent[]} Those referenced by `html`, deduplicated.
 */
export function selectUsedComponents(html, available) {
	/** @type {Set<string>} */
	const used = new Set();
	for (const match of html.matchAll(/<([A-Z][A-Za-z0-9_]*)/g)) {
		used.add(match[1]);
	}
	return available.filter((component) => used.has(component.name));
}
