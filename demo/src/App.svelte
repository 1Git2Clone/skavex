<script>
	import { mount, unmount } from 'svelte';
	import {
		render,
		buildModule,
		selectUsedComponents,
		referencedComponents
	} from '@skavex/skavex/browser';
	import { buildComponent, loadPlugin } from './build.js';
	import {
		DOCUMENT,
		COMPONENTS,
		PLUGINS,
		VALID_NAME,
		newComponentSource,
		newPluginSource
	} from './workspace.js';

	const TABS = /** @type {const} */ (['Rendered', 'Svelte source', 'Metadata']);
	const MARKDOWN = 'document.md';

	let source = $state(DOCUMENT);
	let components = $state(COMPONENTS.map((file) => ({ ...file })));
	let plugins = $state(PLUGINS.map((file) => ({ ...file })));

	let focused = $state(MARKDOWN);
	let treeOpen = $state(false);
	let tab = $state('Rendered');
	let elapsed = $state(0);

	/**
	 * @type {{
	 *   code: string,
	 *   metadata: import('../../src/browser.js').DocumentMetadata,
	 *   component: import('svelte').Component | null,
	 *   css: string,
	 *   used: string[],
	 *   error: string
	 * }}
	 */
	let output = $state({ code: '', metadata: {}, component: null, css: '', used: [], error: '' });
	/** @type {HTMLElement | undefined} */
	let preview = $state();
	// Kept apart from `output` deliberately: the mount effect reads
	// `output.component`, so writing a mount failure back into `output` would
	// retrigger the effect that produced it.
	let mountError = $state('');

	// Renders are async and the debounce does not stop two from overlapping, so
	// a slow one started earlier can resolve after a fast one started later and
	// overwrite it with output for a document that is no longer in the editor.
	// Only the newest request may write.
	let latest = 0;

	$effect(() => {
		// Read every input so any edit — document, component or plugin — schedules
		// a rebuild. $state.snapshot detaches them from the proxies so the async
		// work below cannot observe a later keystroke half-applied.
		const current = {
			source,
			components: $state.snapshot(components),
			plugins: $state.snapshot(plugins)
		};

		// Typing is faster than a parse plus two compilers; without this the
		// editor drops frames on every keystroke.
		const timer = setTimeout(() => void update(current), 200);
		return () => clearTimeout(timer);
	});

	/**
	 * Run the document through the real pipeline and compile what comes out.
	 *
	 * @param {{
	 *   source: string,
	 *   components: import('./build.js').WorkspaceFile[],
	 *   plugins: import('./build.js').WorkspaceFile[]
	 * }} workspace Everything the build depends on.
	 * @returns {Promise<void>}
	 */
	async function update(workspace) {
		const started = performance.now();
		const request = ++latest;

		try {
			/** @type {import('unified').PluggableList} */
			const remarkPlugins = [];
			/** @type {import('unified').PluggableList} */
			const rehypePlugins = [];

			for (const file of workspace.plugins) {
				const { plugin, stage } = await loadPlugin(file);
				(stage === 'rehype' ? rehypePlugins : remarkPlugins).push(plugin);
			}

			const { html, metadata } = await render(workspace.source, {
				remarkPlugins,
				rehypePlugins
			});

			// The same rule the build-time pipeline uses, not a copy of it: a
			// component is imported only if the document actually names it.
			const usable = workspace.components.filter((file) => VALID_NAME.test(file.name));
			const used = selectUsedComponents(
				html,
				usable.map((file) => ({
					name: file.name,
					specifier: `./components/${file.name}.svelte`
				}))
			);

			// buildModule is exactly what the Vite plugin hands to the Svelte
			// compiler at build time. The difference here is only that the compiler
			// then runs in this tab instead of on a build server.
			// A tag with no file behind it compiles to a reference to an undefined
			// variable, which throws at mount and leaves a blank pane. Say which tag
			// and which file is missing instead — that is the whole diagnosis.
			const names = used.map((component) => component.name);
			const missing = referencedComponents(html).filter((name) => !names.includes(name));
			if (missing.length > 0) {
				throw new Error(
					`the document references ${missing.map((name) => `<${name} />`).join(', ')}, ` +
						`which no file in the tree defines`
				);
			}

			const code = buildModule({ html, metadata, components: used });
			const { component, css } = await buildComponent(
				code,
				usable.filter((file) => names.includes(file.name))
			);

			if (request !== latest) return;
			output = { code, metadata, component, css, used: names, error: '' };
		} catch (error) {
			if (request !== latest) return;
			output = { ...output, error: error instanceof Error ? error.message : String(error) };
		}

		elapsed = performance.now() - started;
	}

	$effect(() => {
		const target = preview;
		const Document = output.component;
		if (!target || !Document) return;

		// The document is a real Svelte component, mounted client-side. Nothing
		// here is server-rendered, which is the same freedom a consumer has: the
		// output of skavex is an ordinary component, so a route may render it on
		// the server, in the client, or both.
		// A component can throw in its own setup, which mount surfaces
		// synchronously. Uncaught, that leaves a dead pane and an error only in the
		// console; the pane beside the editor is where it belongs.
		try {
			const instance = mount(Document, { target });
			mountError = '';
			return () => void unmount(instance);
		} catch (error) {
			mountError = error instanceof Error ? error.message : String(error);
		}
	});

	$effect(() => {
		// Svelte compiles a component's <style> to a separate stylesheet rather
		// than into its module, so nothing installs it on our behalf. One element
		// reused across rebuilds, because this runs on every keystroke.
		const style = document.createElement('style');
		style.textContent = output.css;
		document.head.append(style);
		return () => style.remove();
	});

	const headings = $derived(output.metadata.headings ?? []);
	const focusedComponent = $derived(
		components.find((file) => `components/${file.name}.svelte` === focused)
	);
	const focusedPlugin = $derived(plugins.find((file) => `plugins/${file.name}.js` === focused));

	/**
	 * A name no file in the workspace is using yet.
	 *
	 * @param {string} base                                   Preferred name.
	 * @param {import('./build.js').WorkspaceFile[]} existing Files to avoid colliding with.
	 * @returns {string} `base`, or `base` with the lowest free number appended.
	 */
	function freeName(base, existing) {
		const taken = new Set(existing.map((file) => file.name));
		if (!taken.has(base)) return base;

		let n = 2;
		while (taken.has(`${base}${n}`)) n += 1;
		return `${base}${n}`;
	}

	function addComponent() {
		const name = freeName('NewComponent', components);
		components.push({ name, source: newComponentSource(name) });
		focused = `components/${name}.svelte`;
		treeOpen = true;
	}

	function addPlugin() {
		const name = freeName('plugin', plugins);
		plugins.push({ name, source: newPluginSource(name) });
		focused = `plugins/${name}.js`;
		treeOpen = true;
	}

	/**
	 * Drop a file, moving focus off it if it was the one being edited.
	 *
	 * @param {import('./build.js').WorkspaceFile[]} list The list it belongs to.
	 * @param {string} name                               Which file.
	 * @returns {void}
	 */
	function remove(list, name) {
		const index = list.findIndex((file) => file.name === name);
		if (index === -1) return;

		list.splice(index, 1);
		if (!focusedComponent && !focusedPlugin) focused = MARKDOWN;
	}
</script>

<header>
	<h1>skavex</h1>
	<p>
		Markdown&nbsp;+&nbsp;LaTeX&nbsp;+&nbsp;Svelte components. <em>This playground</em> ships the
		pipeline <em>and</em> the Svelte compiler to your browser so it can rebuild as you type; a site
		built with skavex ships neither.
	</p>
</header>

<main>
	<aside class="files" class:open={treeOpen}>
		<div class="bar">
			<button
				class="hamburger"
				aria-expanded={treeOpen}
				aria-label={treeOpen ? 'Collapse file tree' : 'Expand file tree'}
				onclick={() => (treeOpen = !treeOpen)}
			>
				<span></span><span></span><span></span>
			</button>
			{#if treeOpen}<span class="root">workspace</span>{/if}
		</div>

		{#if treeOpen}
			<nav class="tree">
				<button
					class="file"
					class:active={focused === MARKDOWN}
					onclick={() => (focused = MARKDOWN)}
				>
					{MARKDOWN}
				</button>

				<div class="group">
					<span class="dir">components/</span>
					<button class="add" title="Add a component" onclick={addComponent}>+</button>
				</div>
				{#each components as file (file)}
					{@const path = `components/${file.name}.svelte`}
					<div class="row" class:active={focused === path}>
						<button class="file" onclick={() => (focused = path)}>
							{file.name}.svelte
							{#if !output.used.includes(file.name)}<em
									title="Not referenced by the document">unused</em
								>{/if}
						</button>
						<button
							class="drop"
							aria-label="Remove {file.name}.svelte"
							onclick={() => remove(components, file.name)}>×</button
						>
					</div>
				{/each}

				<div class="group">
					<span class="dir">plugins/</span>
					<button class="add" title="Add a plugin" onclick={addPlugin}>+</button>
				</div>
				{#each plugins as file (file)}
					{@const path = `plugins/${file.name}.js`}
					<div class="row" class:active={focused === path}>
						<button class="file" onclick={() => (focused = path)}>{file.name}.js</button
						>
						<button
							class="drop"
							aria-label="Remove {file.name}.js"
							onclick={() => remove(plugins, file.name)}>×</button
						>
					</div>
				{/each}
			</nav>
		{:else}
			<div class="spine" title={focused}>{focused}</div>
		{/if}
	</aside>

	<section class="pane">
		{#if focusedComponent}
			<div class="bar">
				<label for="name">name</label>
				<input
					id="name"
					class="name"
					spellcheck="false"
					bind:value={focusedComponent.name}
				/>
				<span class="hint">
					{#if !VALID_NAME.test(focusedComponent.name)}
						must start with a capital
					{:else if output.used.includes(focusedComponent.name)}
						used by the document
					{:else}
						write &lt;{focusedComponent.name} /&gt; in the document to use it
					{/if}
				</span>
			</div>
			<textarea
				aria-label="Component source"
				spellcheck="false"
				bind:value={focusedComponent.source}></textarea>
		{:else if focusedPlugin}
			<div class="bar">
				<label for="name">name</label>
				<input id="name" class="name" spellcheck="false" bind:value={focusedPlugin.name} />
				<span class="hint">a unified plugin; every plugin here runs</span>
			</div>
			<textarea
				aria-label="Plugin source"
				spellcheck="false"
				bind:value={focusedPlugin.source}></textarea>
		{:else}
			<div class="bar"><label for="source">Markdown</label></div>
			<textarea id="source" aria-label="Markdown" spellcheck="false" bind:value={source}
			></textarea>
		{/if}
	</section>

	<section class="pane">
		<div class="bar">
			<!--
				The tabs are grouped so the group can be the thing that gives way when
				the pane is narrow. Left as direct children of the bar they cannot
				shrink and cannot wrap, so they push the timing out through the bar's
				own padding instead.
			-->
			<div class="tabs">
				{#each TABS as name (name)}
					<button class:active={tab === name} onclick={() => (tab = name)}>{name}</button>
				{/each}
			</div>
			<span class="timing">{elapsed.toFixed(1)} ms</span>
		</div>

		{#if output.error || mountError}
			<pre class="error">{output.error || mountError}</pre>
		{:else if tab === 'Rendered'}
			<!--
				No {@html} and no innerHTML: this is the compiled document component,
				mounted. That is the claim the library makes, so the demo should be
				made of it rather than of a screenshot of it.
			-->
			<div class="output prose" bind:this={preview}></div>
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

<footer>
	<span>@skavex/skavex v{__APP_VERSION__} · MIT</span>
	<nav>
		<!-- Relative: the book is published as a subdirectory of this page, so
		     this keeps working on a local `pnpm demo` and under the /skavex/skavex
		     prefix the site is served from, without either being hardcoded. -->
		<a href="./docs/">documentation</a>
		<a href="./docs/benchmarks.html">benchmarks</a>
		<a href="https://git.hu-tao.dev/skavex/skavex">source</a>
		<a href="https://www.npmjs.com/package/@skavex/skavex">npm</a>
	</nav>
</footer>
