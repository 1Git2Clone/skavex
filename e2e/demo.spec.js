import { expect, test } from '@playwright/test';

/**
 * Fail a test on anything the page logged as an error or threw.
 *
 * Svelte reports a broken effect or a bad binding to the console and carries
 * on rendering, so without this a regression that leaves the editor half-dead
 * still passes every visible assertion.
 *
 * @param {import('@playwright/test').Page} page
 * @returns {() => void} Asserts nothing went wrong.
 */
function watchForFailures(page) {
	/** @type {string[]} */
	const problems = [];

	page.on('console', (message) => {
		if (message.type() === 'error') problems.push(`console: ${message.text()}`);
	});
	page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));

	return () => expect(problems).toEqual([]);
}

test.beforeEach(async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('.prose .katex')).not.toHaveCount(0);
});

test('renders the sample document with maths on load', async ({ page }) => {
	const assertClean = watchForFailures(page);

	// MathML, not just the visual HTML. KaTeX's html output alone is silent to a
	// screen reader, so its absence would be an accessibility regression that
	// looks perfect in a screenshot.
	await expect(page.locator('.prose .katex-mathml').first()).toBeAttached();
	await expect(page.locator('.prose .katex-display')).not.toHaveCount(0);
	await expect(page.locator('.prose table')).toHaveCount(1);

	assertClean();
});

test('gives headings ids derived from prose, not from KaTeX markup', async ({ page }) => {
	// The heading's text is "Why $O(n \log \log n)$?" — if ids were assigned
	// after KaTeX ran, this would be a slug of <span class="katex">.
	const heading = page.locator('.prose h2').first();

	await expect(heading).toHaveAttribute('id', /^why-on/);
	await expect(heading).not.toHaveAttribute('id', /katex|span/);
});

test('escapes braces in prose while leaving a component tag intact', async ({ page }) => {
	// The contract the whole library is built around, asserted where it matters:
	// in the generated Svelte, which is what the compiler will read.
	await page.getByRole('button', { name: 'Svelte source' }).click();
	const code = await page.locator('pre.code').innerText();

	// Prose braces became entities, so Svelte reads them as text.
	expect(code).toContain('&#123;braces&#125;');
	// The component's own braces did NOT, so `start={3}` is still a real prop.
	expect(code).toContain('<Counter start={3} />');
	expect(code).toContain('<script module>');
	expect(code).toContain('export const metadata =');
});

test('labels a component tag the browser cannot render', async ({ page }) => {
	// The preview pane is raw HTML, so <Counter /> is an element the browser has
	// never heard of and draws as nothing. An unexplained blank gap in the middle
	// of the demo's main point is worse than no example at all.
	const placeholder = page.locator('.prose .unrendered');

	await expect(placeholder).toHaveCount(1);
	await expect(placeholder).toHaveAttribute('data-tag', 'counter');
});

test('re-renders as the document is edited', async ({ page }) => {
	const assertClean = watchForFailures(page);
	const editor = page.getByLabel('Markdown');

	await editor.fill('## Edited\n\nNew maths: $e^{i\\pi} + 1 = 0$\n');

	await expect(page.locator('.prose h2')).toHaveText('Edited');
	await expect(page.locator('.prose .katex-mathml').first()).toBeAttached();
	await expect(page.locator('.prose table')).toHaveCount(0);

	assertClean();
});

test('collects frontmatter and a table of contents that renders its maths', async ({ page }) => {
	await page.getByRole('button', { name: 'Metadata' }).click();

	await expect(page.locator('pre.code')).toContainText('"title": "Sieve of Eratosthenes"');

	// Navigation shows the formula rather than its LaTeX source — the same KaTeX
	// options as the body, so the maths is not silent in the one place a reader
	// uses to move around the document.
	const entries = page.locator('.toc li');
	await expect(entries).toHaveCount(2);
	await expect(entries.first().locator('.katex')).toBeAttached();
});

test('reports a malformed document instead of going blank', async ({ page }) => {
	const editor = page.getByLabel('Markdown');

	await editor.fill('---\ntitle: [unterminated\n---\n\nbody\n');

	// Either it recovers or it says why. What it must not do is render nothing
	// and leave the reader with a blank pane and no explanation.
	const pane = page.locator('.output, .error').first();
	await expect(pane).not.toBeEmpty();
});
