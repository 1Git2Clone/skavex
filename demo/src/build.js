/**
 * Compile Svelte source in the browser and hand back a runnable component.
 *
 * The editor's whole claim is that a markdown document becomes a real Svelte
 * component. Showing generated source next to a pane of dead markup does not
 * demonstrate that — it asks to be taken on faith. So the playground runs the
 * Svelte compiler too, and mounts what it produces.
 *
 * The compiler emits a module that imports Svelte's runtime, and the browser
 * has no module resolver. Each compiled module therefore becomes a blob URL,
 * and runtime imports are rewritten to point at generated shim modules that
 * re-export the runtime this page already bundles. That is the same trick
 * Svelte's own REPL uses.
 *
 * None of this reaches a site built with skavex: there the compiler runs at
 * build time and the browser is sent finished HTML.
 */

/* eslint-disable svelte/no-svelte-internal --
   The ban is correct for application code: these modules are private and
   Svelte 6 will move them. This module is not application code. It is a
   loader for output the Svelte compiler produced a moment ago, and that
   output imports these specifiers by name. Declining to provide them would
   not remove the coupling, only stop the compiled module from resolving. If
   Svelte 6 renames them this fails at build time, which is the right place. */

import { compile } from 'svelte/compiler';
import * as svelte from 'svelte';
import * as internalClient from 'svelte/internal/client';
import * as internalDisclose from 'svelte/internal/disclose-version';
import * as flagsLegacy from 'svelte/internal/flags/legacy';
import * as flagsAsync from 'svelte/internal/flags/async';
import * as unistUtilVisit from 'unist-util-visit';
import * as katex from 'katex';

/**
 * The runtime modules compiled output imports, keyed by the specifier the
 * compiler emits for them.
 *
 * @type {Record<string, Record<string, unknown>>}
 */
const RUNTIME = {
	svelte,
	'svelte/internal/client': internalClient,
	'svelte/internal/disclose-version': internalDisclose,
	// Emitted for a component that uses no runes — which the generated document
	// usually is, since its markup comes from markdown. A project that sets
	// `compilerOptions.runes` gets the other path; both have to work here.
	'svelte/internal/flags/legacy': flagsLegacy,
	'svelte/internal/flags/async': flagsAsync,
	// Not emitted by the compiler — offered to plugins written in the editor,
	// which need a tree walker and a maths renderer and cannot install either.
	'unist-util-visit': unistUtilVisit,
	katex
};

/** Where a generated shim module reaches the bundled runtime. */
const REGISTRY = '__skavexPlaygroundRuntime';

// A generated module is fetched from a blob URL, so it shares no scope with
// this one and can only reach the runtime through a global. Defined rather
// than assigned so it cannot be indexed into as an untyped bag.
Object.defineProperty(globalThis, REGISTRY, { value: RUNTIME });

/** An export name that can be written bare rather than as a string. */
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** Shim URL per runtime specifier; the runtime never changes, so build once. */
const shims = new Map();

/**
 * Wrap a string of JavaScript in a URL the browser will import.
 *
 * @param {string} code The module's source.
 * @returns {string} A blob URL for it.
 */
function moduleUrl(code) {
	return URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
}

/**
 * Build a module that re-exports one of the bundled runtime modules.
 *
 * Every export is bound to a generated local and renamed on the way out.
 * `export const <name>` would be shorter but cannot express the export names a
 * module is actually allowed to have: `svelte/internal/client` exports `if` and
 * `await`, and the compiler emits calls to both.
 *
 * @param {string} specifier Which runtime module, as the compiler spells it.
 * @returns {string} A blob URL exporting everything that module exports.
 */
function shimFor(specifier) {
	const cached = shims.get(specifier);
	if (cached !== undefined) return cached;

	const exported = RUNTIME[specifier];
	if (exported === undefined) {
		throw new Error(
			`cannot import "${specifier}": the playground offers only ${Object.keys(RUNTIME).join(', ')}`
		);
	}

	const lines = [
		`const m = globalThis[${JSON.stringify(REGISTRY)}][${JSON.stringify(specifier)}];`
	];
	/** @type {string[]} */
	const clause = [];

	for (const [index, name] of Object.keys(exported).entries()) {
		lines.push(`const v${index} = m[${JSON.stringify(name)}];`);
		clause.push(`v${index} as ${IDENTIFIER.test(name) ? name : JSON.stringify(name)}`);
	}

	if (clause.length > 0) lines.push(`export { ${clause.join(', ')} };`);

	const url = moduleUrl(lines.join('\n'));
	shims.set(specifier, url);
	return url;
}

/**
 * An import statement's specifier, matched only at the start of a line.
 *
 * Compiled output puts every import on its own line, so anchoring here keeps
 * the rewrite off string literals in the module body that happen to contain
 * the word `from`.
 */
const IMPORT = /^(\s*(?:import|export)[^'"]*?\bfrom\s*|\s*import\s*)(['"])([^'"]+)\2/;

/**
 * Point a compiled module's imports at modules the browser can actually fetch.
 *
 * @param {string} code                              Compiled JavaScript.
 * @param {(specifier: string) => string} resolve    Turns a specifier into a URL.
 * @returns {string} The same code with every import specifier replaced.
 */
function rewriteImports(code, resolve) {
	return code
		.split('\n')
		.map((line) =>
			line.replace(
				IMPORT,
				(_, head, quote, specifier) => `${head}${quote}${resolve(specifier)}${quote}`
			)
		)
		.join('\n');
}

/**
 * One `.svelte` file in the playground's workspace.
 *
 * @typedef {object} WorkspaceFile
 * @property {string} name   Component name, as markup spells it.
 * @property {string} source Its Svelte source.
 */

/**
 * Compile a document and the components it uses into a mountable component.
 *
 * Components are compiled in the order given, so one may import another only
 * if that other comes first.
 *
 * ponytail: no dependency sort. A forward reference throws a readable error
 * rather than a cryptic one; sort topologically if components start importing
 * each other in earnest.
 *
 * A component's `<style>` is compiled to a separate stylesheet rather than
 * bundled into its module, so it is returned for the caller to install. Dropping
 * it would render every component unstyled while looking like it worked.
 *
 * @param {string} document                  Svelte source for the document.
 * @param {WorkspaceFile[]} components       Components it may import.
 * @returns {Promise<{component: import('svelte').Component, css: string}>}
 *   The compiled document component and the CSS its components need.
 */
export async function buildComponent(document, components) {
	/** @type {string[]} */
	const created = [];
	/** @type {string[]} */
	const stylesheets = [];
	/** @type {Map<string, string>} */
	const byName = new Map();

	/**
	 * Turn an import specifier from compiled output into a fetchable URL.
	 *
	 * @param {string} specifier As written in the compiled module.
	 * @returns {string} A blob URL serving it.
	 */
	const resolve = (specifier) => {
		if (specifier in RUNTIME) return shimFor(specifier);

		const name = specifier.replace(/^.*\//, '').replace(/\.svelte$/, '');
		const url = byName.get(name);
		if (url !== undefined) return url;

		throw new Error(
			`cannot import "${specifier}": this playground resolves Svelte's runtime and ` +
				`the components in the file tree, nothing else`
		);
	};

	/**
	 * Compile one Svelte file into a module the browser can import.
	 *
	 * @param {string} name   The component's name.
	 * @param {string} source Its Svelte source.
	 * @returns {string} A blob URL for the compiled module.
	 */
	const build = (name, source) => {
		const { js, css } = compile(source, {
			name,
			filename: `${name}.svelte`,
			generate: 'client'
		});
		if (css) stylesheets.push(css.code);

		const url = moduleUrl(rewriteImports(js.code, resolve));
		created.push(url);
		return url;
	};

	try {
		for (const component of components) {
			byName.set(component.name, build(component.name, component.source));
		}

		const entry = build('Document', document);
		const module = await import(/* @vite-ignore */ entry);
		return { component: module.default, css: stylesheets.join('\n') };
	} finally {
		// Safe the moment the import settles: the browser has the modules, and a
		// live editor recompiles on every keystroke, so not revoking would leak a
		// module per character typed.
		for (const url of created) URL.revokeObjectURL(url);
	}
}

/**
 * Load a plugin written in the editor.
 *
 * Plain JavaScript, so there is nothing to compile — only imports to resolve,
 * and only against what this page already bundles.
 *
 * @param {WorkspaceFile} plugin The plugin's source.
 * @returns {Promise<{plugin: import('unified').Plugin, stage: 'remark' | 'rehype'}>}
 *   Its default export, and which tree it asked to run on.
 */
export async function loadPlugin(plugin) {
	const url = moduleUrl(rewriteImports(plugin.source, shimFor));

	try {
		const module = await import(/* @vite-ignore */ url);

		if (typeof module.default !== 'function') {
			throw new Error(`${plugin.name}.js must default-export a function`);
		}

		return { plugin: module.default, stage: module.stage === 'rehype' ? 'rehype' : 'remark' };
	} finally {
		URL.revokeObjectURL(url);
	}
}
