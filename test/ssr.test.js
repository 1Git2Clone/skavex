import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile as compileSvelte } from 'svelte/compiler';
import { render as renderSSR } from 'svelte/server';
import { compile } from '../src/index.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * Temporary directory INSIDE the package. Node resolves bare specifiers by
 * walking up from the importing file, so a module in the OS temp directory
 * could not find `svelte/internal/server`.
 */
const TMP_ROOT = path.join(HERE, '.tmp');

/** @type {string[]} */
const created = [];

/**
 * Compile markdown all the way to server-rendered HTML, the way a real request
 * would: markdown -> Svelte source -> server module -> HTML string.
 *
 * @param {string} markdown
 * @param {import('../src/compile.js').SkavexOptions} [options]
 * @returns {Promise<string>} The rendered HTML body.
 */
async function renderMarkdownOnServer(markdown, options = {}) {
	const { code } = await compile(markdown, options);
	const compiled = compileSvelte(code, { name: 'Doc', generate: 'server' });

	const dir = await mkdtemp(TMP_ROOT + path.sep);
	created.push(dir);

	// Node has no loader for `.svelte`, so every component the document imports
	// is compiled to a sibling module and the specifier rewritten. Vite does the
	// equivalent in a real build; doing it here keeps the test end-to-end rather
	// than stubbing the part being tested.
	let js = compiled.js.code;
	for (const [, specifier] of js.matchAll(/from\s+["']([^"']+\.svelte)["']/g)) {
		const name = path.basename(specifier, '.svelte');
		const source = await readFile(specifier, 'utf8');
		const componentJs = compileSvelte(source, { name, generate: 'server' }).js.code;
		await writeFile(path.join(dir, `${name}.js`), componentJs, 'utf8');
		js = js.replaceAll(specifier, `./${name}.js`);
	}

	const file = path.join(dir, 'Doc.js');
	await writeFile(file, js, 'utf8');

	const module = await import(/* @vite-ignore */ file);
	return renderSSR(module.default).body;
}

beforeAll(async () => {
	// mkdtemp creates the final segment only; its parent has to exist.
	await mkdir(TMP_ROOT, { recursive: true });
});

afterAll(async () => {
	await Promise.all(created.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('server rendering', () => {
	it('renders prose to HTML with no client-side work', async () => {
		const body = await renderMarkdownOnServer('# Title\n\nSome **bold** prose.');

		// Headings carry ids by default; see the headings option.
		expect(body).toContain('<h1 id="title">Title</h1>');
		expect(body).toContain('<strong>bold</strong>');
	});

	it('renders maths into the server output, not on the client', async () => {
		// The point of the whole exercise: KaTeX markup must be present in the
		// first response, so there is no layout shift and a crawler sees it.
		const body = await renderMarkdownOnServer('Inline $O(n)$ and $$\\frac{a}{b}$$');

		expect(body).toContain('katex');
		expect(body).toContain('katex-mathml');
		expect(body).not.toContain('$O(n)$');
	});

	it('renders literal braces as text rather than evaluating them', async () => {
		const body = await renderMarkdownOnServer('Prose with {arr[i]} braces.');

		// The reader must see the braces; the compiler must not have run them.
		expect(body).toContain('{arr[i]}');
	});

	it('renders GFM tables server-side', async () => {
		const body = await renderMarkdownOnServer('| a | b |\n| - | - |\n| 1 | 2 |');

		expect(body).toContain('<table>');
		expect(body).toContain('<td>1</td>');
	});

	it('renders a component a plugin injected', async () => {
		const injectCallout = () => (tree) => {
			tree.children[0] = { type: 'html', value: '<Callout>hello from a component</Callout>' };
		};

		const body = await renderMarkdownOnServer('replaced', {
			components: path.join(HERE, 'fixtures', 'components'),
			root: HERE,
			remarkPlugins: [injectCallout]
		});

		// The fixture renders an <aside>, so seeing one proves the component was
		// resolved, imported and executed rather than emitted as literal text.
		expect(body).toContain('<aside>');
		expect(body).toContain('hello from a component');
		expect(body).not.toContain('<Callout>');
	});
});
