/**
 * Turn heading text into a URL fragment.
 *
 * Exported because a document's heading `id` and a table of contents' `href`
 * have to be produced by the same function. They are generated at different
 * times — the id during the build, the href wherever the navigation is
 * rendered — so a project that reimplements this on the other side has two
 * copies that must agree forever. They will not. Import this one on both
 * sides instead.
 *
 * The `<.../>`  and `{...}` clauses strip component markup and expressions that
 * survived into the heading's text, so a heading containing either still
 * slugifies to something stable.
 *
 * @param {string} text Heading text, already flattened.
 * @returns {string} A lowercase, hyphenated fragment with no unsafe characters.
 *
 * @example
 * slugify('$O(\\log n)$ - Logarithmic Complexity') // 'olog-n-logarithmic-complexity'
 */
export function slugify(text) {
	return String(text)
		.replace(/<[^>]*\/>/g, '')
		.replace(/\{[^}]*\}/g, '')
		.toLowerCase()
		.trim()
		.replace(/\s+/g, '-')
		.replace(/[^\w-]+/g, '')
		.replace(/--+/g, '-')
		.replace(/^-+|-+$/g, '');
}
