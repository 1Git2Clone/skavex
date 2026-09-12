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
	} catch (error) {
		const source = await page.getByLabel('Markdown').inputValue();
		const rendered = await page.locator('.prose').innerHTML();
		throw new Error(
			`${error instanceof Error ? error.message : String(error)}\n` +
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
		/** @type {globalThis.HTMLTextAreaElement} */ (element).value = text;
		element.dispatchEvent(new Event('input', { bubbles: true }));
	}, value);
}

/**
 * Describe where an element actually is, and what is containing it.
 *
 * Playwright reports "element is not visible" for a zero box, a
 * `visibility: hidden` ancestor and an element clipped out of an
 * `overflow: hidden` parent alike. On a machine that reproduces none of it,
 * that message is not enough to act on — this prints the chain that decides it.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} selector The element to describe.
 * @returns {Promise<string>} A line per ancestor, plus the viewport.
 */
async function describeGeometry(page, selector) {
	return page.evaluate((target) => {
		const element = globalThis.document.querySelector(target);
		if (!element) return `${target}: not in the DOM at all`;

		const lines = [`viewport ${globalThis.innerWidth}x${globalThis.innerHeight}`];

		// parentElement is Element | null, so the walker has to admit null rather
		// than inherit `Element` from the starting node.
		/** @type {globalThis.Element | null} */
		let node = element;

		for (; node && node !== globalThis.document.documentElement; node = node.parentElement) {
			const box = node.getBoundingClientRect();
			const styles = globalThis.getComputedStyle(node);
			const name =
				node.tagName.toLowerCase() +
				(node.className ? `.${String(node.className).split(' ').join('.')}` : '');
			lines.push(
				`${name} y=${Math.round(box.y)} h=${Math.round(box.height)} w=${Math.round(box.width)} ` +
					`overflow=${styles.overflow} visibility=${styles.visibility} display=${styles.display}`
			);
		}
		return lines.join('\n');
	}, selector);
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
	// Done by the workspace's own `contents` plugin, not by skavex — but it only
	// works because `rehypePlugins` runs before KaTeX. The heading's text is
	// "Why $O(n \log \log n)$?"; assigned after KaTeX ran, this would be a slug
	// of <span class="katex">.
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

test('runs the document as a real Svelte component', async ({ page }) => {
	const assertClean = watchForFailures(page);

	// The claim the library exists to make. A dead <counter> tag in a pane of
	// raw HTML would satisfy every other assertion in this file while proving
	// nothing, so this one insists the component is mounted and alive.
	const counter = page.locator('.prose button');
	await expect(counter).toHaveText(/counted to 3/);

	await counter.click();
	await expect(counter).toHaveText(/counted to 4/);

	// Its <style> too: Svelte compiles that to a separate stylesheet, so a demo
	// that forgot to install it would render an unstyled button and look fine
	// to every assertion above.
	await expect(counter).toHaveCSS('border-style', 'solid');

	assertClean();
});

test('keeps markdown, maths and components composable', async ({ page }) => {
	// Children of a component are still markdown — the case that separates this
	// from passing a string prop — and maths inside them still renders.
	const callout = page.locator('.prose aside[data-type="note"]');

	await expect(callout).toHaveCount(1);
	await expect(callout.locator('.katex')).not.toHaveCount(0);
});

test('runs remark plugins written in the editor', async ({ page }) => {
	// <mark> is not markdown. It exists only because the plugin in the file tree
	// ran, which is the whole of skavex's plugin story asserted end to end.
	await expect(page.locator('.prose mark')).toHaveText('highlighted text');
});

test('adds a component, compiles it into the document, and removes it', async ({ page }) => {
	const assertClean = watchForFailures(page);
	await page.getByRole('button', { name: 'Expand file tree' }).click();

	// The aside animates its width, so the tree's contents are in the DOM before
	// they have settled anywhere. Waiting on the button rather than clicking
	// straight into the transition is a real precondition, not a sleep.
	const add = page.getByTitle('Add a component');
	try {
		await expect(add).toBeVisible();
		await add.click();
	} catch (error) {
		throw new Error(
			`${error instanceof Error ? error.message : String(error)}\n` +
				`--- where the button actually was ---\n${await describeGeometry(page, '.tree .add')}`,
			{ cause: error }
		);
	}

	await expect(page.getByLabel('Component source')).toBeVisible();

	// A new component is inert until the document names it — the same rule the
	// build-time pipeline applies, so the demo should not pretend otherwise.
	await page.locator('.tree .file', { hasText: 'document.md' }).click();
	await setSource(page, 'Hello\n\n<NewComponent label="it works" />\n');
	await reporting(page, async () => {
		await expect(page.locator('.prose p', { hasText: 'it works' })).toHaveCount(1);
	});

	// Removing it leaves the document referencing a file that is gone. That must
	// be a sentence naming the tag, not a blank pane and a console error.
	await page.getByRole('button', { name: 'Remove NewComponent.svelte' }).click();
	await expect(page.locator('.error')).toContainText('<NewComponent />');

	assertClean();
});

test('collapses the file tree to the focused file', async ({ page }) => {
	// Collapsing reclaims width; it should not cost you your place.
	await expect(page.locator('.spine')).toHaveText('document.md');

	await page.getByRole('button', { name: 'Expand file tree' }).click();
	await expect(page.locator('.tree')).toBeVisible();
	await expect(page.locator('.spine')).toHaveCount(0);

	await page.getByRole('button', { name: 'Collapse file tree' }).click();
	await expect(page.locator('.spine')).toHaveText('document.md');
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

	// Navigation shows the formula rather than its LaTeX source, because the
	// `contents` plugin renders it with the same KaTeX the body uses. The whole
	// table of contents is a forty-line plugin in the file tree, which is the
	// point being demonstrated: skavex ships no such feature and does not need to.
	// One per heading in the sample: Why…, Comparison, Components, Plugins.
	const entries = page.locator('.toc li');
	await expect(entries).toHaveCount(4);
	await expect(entries.first().locator('.katex')).toBeAttached();
});

test('shows the package version it was built from', async ({ page }) => {
	// A footer that states a version nobody bumps is worse than no version.
	// vite.config.js reads it from package.json for exactly that reason.
	await expect(page.locator('footer')).toContainText(/v\d+\.\d+\.\d+/);
});

test('reports a malformed document instead of going blank', async ({ page }) => {
	await setSource(page, '---\ntitle: [unterminated\n---\n\nbody\n');

	// Either it recovers or it says why. What it must not do is render nothing
	// and leave the reader with a blank pane and no explanation.
	const pane = page.locator('.output, .error').first();
	await expect(pane).not.toBeEmpty();
});
