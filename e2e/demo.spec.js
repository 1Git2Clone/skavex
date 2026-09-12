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

/**
 * Run an assertion and, if it fails, say what the page actually held.
 *
 * A locator that timed out reports only which selector it could not find,
 * which is the least useful half of the story when a failure reproduces on one
 * machine and nowhere else.
 *
 * @param {import('@playwright/test').Page} page
 * @param {() => Promise<void>} assertion
 * @returns {Promise<void>}
 */
async function reporting(page, assertion) {
	try {
		await assertion();
	} catch (/** @type {any} */ error) {
		const source = await page.getByLabel('Markdown').inputValue();
		const rendered = await page.locator('.prose').innerHTML();
		throw new Error(
			`${error.message}\n` +
				`--- editor held ---\n${JSON.stringify(source)}\n` +
				`--- pane held ---\n${rendered.slice(0, 1500)}`,
			{ cause: error }
		);
	}
}

/**
 * Replace the editor's contents.
 *
 * Not `fill()`. On the CI runner that delivered only the first line of a
 * multi-line document — the pane then rendered exactly what it had been given,
 * and the test blamed the app for the missing maths. Setting the value and
 * dispatching `input` is the same signal a paste produces and the one
 * `bind:value` listens for, so it exercises the editor rather than Playwright's
 * choice of text-insertion strategy.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} value
 * @returns {Promise<void>}
 */
async function setSource(page, value) {
	await page.getByLabel('Markdown').evaluate((element, text) => {
		/** @type {HTMLTextAreaElement} */ (element).value = text;
		element.dispatchEvent(new Event('input', { bubbles: true }));
	}, value);
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
	const code = page.locator('pre.code');

	// Retrying assertions rather than one `innerText()` read compared with
	// toContain: the read happens once, so on a loaded machine it can catch the
	// pane before its first render and fail with no second look.
	//
	// Prose braces became entities, so Svelte reads them as text.
	await expect(code).toContainText('&#123;braces&#125;');
	// The component's own braces did NOT, so `start={3}` is still a real prop.
	await expect(code).toContainText('<Counter start={3} />');
	await expect(code).toContainText('<script module>');
	await expect(code).toContainText('export const metadata =');
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
	await setSource(page, '## Edited\n\nNew maths: $e^{i\\pi} + 1 = 0$\n');

	await reporting(page, async () => {
		await expect(page.locator('.prose h2')).toHaveText('Edited');
		await expect(page.locator('.prose .katex-mathml').first()).toBeAttached();
		await expect(page.locator('.prose table')).toHaveCount(0);
	});

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
	await setSource(page, '---\ntitle: [unterminated\n---\n\nbody\n');

	// Either it recovers or it says why. What it must not do is render nothing
	// and leave the reader with a blank pane and no explanation.
	const pane = page.locator('.output, .error').first();
	await expect(pane).not.toBeEmpty();
});
