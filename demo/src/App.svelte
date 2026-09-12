<script>
	import { render, buildModule } from '@skavex/skavex/browser';
	import { SAMPLE } from './sample.js';

	const TABS = /** @type {const} */ (['Rendered', 'Svelte source', 'Metadata']);

	let source = $state(SAMPLE);
	let tab = $state('Rendered');
	/**
	 * @type {{
	 *   html: string,
	 *   code: string,
	 *   metadata: import('../../src/browser.js').DocumentMetadata,
	 *   error: string
	 * }}
	 */
	let output = $state({ html: '', code: '', metadata: {}, error: '' });
	/** @type {HTMLElement | undefined} */
	let preview = $state();
	let elapsed = $state(0);

	// Renders are async and the debounce does not stop two from overlapping, so
	// a slow one started earlier can resolve after a fast one started later and
	// overwrite it with output for a document that is no longer in the editor.
	// Only the newest request may write.
	let latest = 0;

	$effect(() => {
		const current = source;
		// Typing is faster than a full parse of a large document; without this the
		// editor drops frames on every keystroke.
		const timer = setTimeout(() => void update(current), 120);
		return () => clearTimeout(timer);
	});

	/** @param {string} value */
	async function update(value) {
		const started = performance.now();
		const request = ++latest;
		try {
			const { html, metadata } = await render(value);
			// The whole point of the library, shown rather than described: the same
			// document is also a real Svelte component. buildModule is what the Vite
			// plugin hands to the Svelte compiler at build time.
			const code = buildModule({ html, metadata, components: [] });
			if (request !== latest) return;
			output = { html, code, metadata, error: '' };
		} catch (error) {
			if (request !== latest) return;
			output = {
				...output,
				error: error instanceof Error ? error.message : String(error)
			};
		}
		elapsed = performance.now() - started;
	}

	$effect(() => {
		// A component tag survives into the HTML as-is, which means the browser
		// parses <Counter /> into an element it has never heard of and renders
		// nothing — a blank gap where the demo is making its main point. Label it
		// instead: the tag is real, it just becomes a component when the Svelte
		// compiler runs, which is the next tab along.
		void output.html;
		for (const element of preview?.querySelectorAll('*') ?? []) {
			if (!(element instanceof HTMLUnknownElement)) continue;
			element.classList.add('unrendered');
			/** @type {HTMLElement} */ (element).dataset.tag = element.tagName.toLowerCase();
		}
	});

	const headings = $derived(output.metadata.headings ?? []);
</script>

<header>
	<h1>skavex</h1>
	<p>
		Server-rendered Markdown&nbsp;+&nbsp;LaTeX for Svelte. <em>This editor</em> ships the whole
		pipeline to your browser so it can re-render as you type; a site built with skavex ships none
		of it.
	</p>
	<nav>
		<a href="https://www.npmjs.com/package/@skavex/skavex">npm</a>
		<a href="https://git.hu-tao.dev/skavex/skavex">source</a>
	</nav>
</header>

<main>
	<section class="pane">
		<div class="bar"><label for="source">Markdown</label></div>
		<textarea id="source" spellcheck="false" bind:value={source}></textarea>
	</section>

	<section class="pane">
		<div class="bar">
			{#each TABS as name (name)}
				<button class:active={tab === name} onclick={() => (tab = name)}>{name}</button>
			{/each}
			<span class="timing">{elapsed.toFixed(1)} ms</span>
		</div>

		{#if output.error}
			<pre class="error">{output.error}</pre>
		{:else if tab === 'Rendered'}
			<!-- Raw HTML from the editor, deliberately. skavex renders with
			     allowDangerousHtml so a document can carry markup; that is safe here
			     because the only author is whoever is typing. Never wire this pane to
			     a URL parameter — that would turn it into a link-shaped XSS. -->
			<div class="output prose" bind:this={preview}>
				<!--
					Raw HTML is the point: skavex renders with allowDangerousHtml so
					documents can carry markup, and the only author here is whoever is
					typing into the pane beside it. That is what makes it safe, and it
					stops being true the moment this pane's source is anything but the
					textarea — a URL parameter would turn it into a link-shaped XSS.
				-->
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html output.html}
			</div>
		{:else if tab === 'Svelte source'}
			<pre class="output code">{output.code}</pre>
		{:else}
			<div class="output">
				<h2>Table of contents</h2>
				<ul class="toc">
					{#each headings as heading (heading.id)}
						<!-- Maths renders in navigation too, from the same KaTeX options. -->
						<li style="--depth: {heading.level - 2}">
							<!--
								KaTeX markup this library produced a moment ago from the same
								editor contents, so it is no more user-controlled than the pane
								above.
							-->
							<!-- eslint-disable-next-line svelte/no-at-html-tags -->
							<a href="#{heading.id}">{@html heading.html}</a>
						</li>
					{/each}
				</ul>
				<h2>Frontmatter</h2>
				<pre class="code">{JSON.stringify(output.metadata, null, 2)}</pre>
			</div>
		{/if}
	</section>
</main>
