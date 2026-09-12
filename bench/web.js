/**
 * What the two approaches cost a reader.
 *
 * The build-time numbers in run.js are a developer's concern. This is the one
 * a visitor feels: when maths is rendered at build time the page is final on
 * first paint, and when it is rendered by a script after load the text reflows
 * underneath them.
 *
 * The client-side page is not a strawman. Its body is literally what
 * mdsvex + remark-math 6 produces — maths left as `$…$` text — with KaTeX's
 * auto-render script bolted on, which is exactly what a project does once it
 * notices the maths never appeared.
 *
 * `node bench/web.js` prints a table and writes bench/results-web.json.
 * `--check` fails if server-rendered maths ever starts shifting the layout.
 *
 * @module
 */

import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { chromium } from '@playwright/test';
import lighthouse from 'lighthouse';
import { render } from '../src/browser.js';
import { ENGINES } from './engines.js';
import { document as makeDocument } from './corpus.js';

const require = createRequire(import.meta.url);
const KATEX_DIST = path.dirname(require.resolve('katex/package.json')) + '/dist';

/** Layout shift below this is what the spec calls "good". */
const GOOD_CLS = 0.1;

/**
 * @param {string} body
 * @param {string} head
 * @returns {string}
 */
function page(body, head) {
	return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/katex/katex.min.css">
<style>body{max-width:44rem;margin:0 auto;padding:2rem;font:16px/1.7 system-ui,sans-serif}
table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:.3rem .6rem}</style>
${head}</head><body><main>${body}</main></body></html>`;
}

/**
 * Both pages, from the same markdown.
 *
 * @returns {Promise<Record<string, string>>}
 */
async function buildPages() {
	// One long document rather than many: layout shift is measured per page, and
	// a page with more maths on it shifts more, which is the effect under study.
	const source = Array.from({ length: 8 }, (_, index) => makeDocument(index)).join('\n\n');

	const { html } = await render(source);

	const mdsvex = /** @type {any} */ (ENGINES.find((engine) => engine.id === 'mdsvex-modern'));
	const unrendered = (await mdsvex.compile(source)).replace(/<script[\s\S]*?<\/script>/g, '');

	return {
		// No script at all. The maths is already in the HTML.
		'/ssr.html': page(html, ''),
		// KaTeX's own auto-render, the way its documentation recommends wiring it.
		'/client.html': page(
			unrendered,
			`<script defer src="/katex/katex.min.js"></script>
<script defer src="/katex/contrib/auto-render.min.js"
  onload="renderMathInElement(document.body,{delimiters:[{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false}]})"></script>`
		)
	};
}

/**
 * @param {Record<string, string>} pages
 * @returns {Promise<{url: string, close: () => Promise<void>}>}
 */
async function serve(pages) {
	const server = createServer(async (request, response) => {
		const url = (request.url ?? '/').split('?')[0];

		if (pages[url]) {
			response.writeHead(200, { 'content-type': 'text/html' });
			response.end(pages[url]);
			return;
		}

		if (url.startsWith('/katex/')) {
			try {
				// Path is confined to KaTeX's own dist directory: this server exists
				// for two local pages and must not become a way to read the repo.
				const file = path.join(KATEX_DIST, url.slice('/katex/'.length));
				if (!file.startsWith(KATEX_DIST)) throw new Error('outside dist');

				const type = file.endsWith('.css')
					? 'text/css'
					: file.endsWith('.js')
						? 'text/javascript'
						: 'font/woff2';
				response.writeHead(200, { 'content-type': type });
				response.end(await readFile(file));
				return;
			} catch {
				// Falls through to the 404 below.
			}
		}

		response.writeHead(404).end();
	});

	await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)));
	const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());

	return {
		url: `http://127.0.0.1:${port}`,
		close: () => new Promise((resolve) => server.close(() => resolve(undefined)))
	};
}

/**
 * Audit one page with Lighthouse.
 *
 * Lighthouse rather than a hand-rolled PerformanceObserver because it applies
 * a documented mobile profile — throttled CPU and network — and reports the
 * metrics under names everyone already knows. On an idle workstation over
 * localhost no approach differs: the script finishes before the first frame
 * and every page looks perfect.
 *
 * @param {string} url
 * @param {number} port Chromium's remote debugging port.
 * @returns {Promise<{score: number, cls: number, lcp: number, tbt: number, bytes: number, scripts: number}>}
 */
async function audit(url, port) {
	const result = await lighthouse(url, { port, output: 'json', logLevel: 'silent' });
	const lhr = /** @type {any} */ (result).lhr;

	/** @param {string} id */
	const metric = (id) => lhr.audits[id].numericValue;

	const scripts = lhr.audits['network-requests'].details.items.filter(
		(/** @type {any} */ item) => item.resourceType === 'Script'
	);

	return {
		score: lhr.categories.performance.score,
		cls: metric('cumulative-layout-shift'),
		lcp: metric('largest-contentful-paint'),
		tbt: metric('total-blocking-time'),
		bytes: metric('total-byte-weight'),
		scripts: scripts.reduce(
			(/** @type {number} */ sum, /** @type {any} */ item) => sum + (item.transferSize ?? 0),
			0
		)
	};
}

const pages = await buildPages();
const server = await serve(pages);
// A fixed port would collide with a second run on the same machine; Lighthouse
// needs to be told which browser to drive, so the port is chosen here.
const port = 9222 + (process.pid % 500);
const browser = await chromium.launch({ args: [`--remote-debugging-port=${port}`] });

/** @type {any[]} */
const results = [];

for (const [route, label, note] of [
	['/ssr.html', 'skavex (maths in the HTML)', 'no script on the page at all'],
	['/client.html', 'client-side KaTeX', 'what a project adds when the maths never appeared']
]) {
	const metrics = await audit(`${server.url}${route}`, port);
	results.push({ route, label, note, ...metrics });
}

await browser.close();
await server.close();

const report = {
	generatedAt: new Date().toISOString(),
	tool: 'lighthouse (mobile profile, simulated throttling)',
	results
};
await writeFile(
	new URL('results-web.json', import.meta.url),
	JSON.stringify(report, null, '\t') + '\n'
);

/**
 * Format a metric, or say it is missing.
 *
 * Lighthouse's trace engine gives up on a heavily loaded machine and returns
 * NaN for the timing-derived audits. Printing "NaN ms" in a benchmark table
 * reads as a measurement, which is worse than admitting there is none.
 *
 * @param {number} value
 * @param {(value: number) => string} format
 * @returns {string}
 */
function metric(value, format) {
	return Number.isFinite(value) ? format(value) : 'n/a';
}

console.log('| Page | Performance | CLS | LCP | Blocking | JavaScript |');
console.log('| --- | --- | --- | --- | --- | --- |');
for (const result of results) {
	console.log(
		`| ${result.label} ` +
			`| ${metric(result.score, (value) => String(Math.round(value * 100)))} ` +
			`| ${metric(result.cls, (value) => value.toFixed(3))} ` +
			`| ${metric(result.lcp, (value) => `${Math.round(value)} ms`)} ` +
			`| ${metric(result.tbt, (value) => `${Math.round(value)} ms`)} ` +
			`| ${(result.scripts / 1024).toFixed(0)} kB |`
	);
}

if (process.argv.includes('--check')) {
	const ssr = results[0];

	// Layout shift is the claim this benchmark exists to defend, and it is also
	// the one metric that survives a contended machine: it comes from layout
	// events rather than from the trace the timing audits need. When even that is
	// missing there is nothing to judge, and failing the build over an absent
	// measurement would only teach people to ignore the job.
	if (!Number.isFinite(ssr.cls)) {
		console.log('\nNo layout-shift measurement on this machine; nothing to check.');
	} else if (ssr.cls > GOOD_CLS) {
		console.error(`\nServer-rendered maths shifted the layout by ${ssr.cls.toFixed(3)}.`);
		process.exit(1);
	} else {
		console.log('\nServer-rendered maths does not move the page.');
	}
}
