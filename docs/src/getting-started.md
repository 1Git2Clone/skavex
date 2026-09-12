# Getting started

```sh
pnpm add -D @skavex/skavex
```

skavex is a Vite plugin, so it goes in `vite.config.js`:

```js
import { skavex } from '@skavex/skavex/vite';
import { sveltekit } from '@sveltejs/kit/vite';

export default {
	plugins: [
		// Before sveltekit(): skavex produces Svelte source, which the Svelte
		// plugin then compiles.
		skavex({
			layout: '/src/lib/components/PostLayout.svelte',
			components: '/src/lib/components/md'
		}),
		sveltekit()
	]
};
```

and `svelte.config.js` has to recognise the extension:

```js
export default {
	extensions: ['.svelte', '.md']
};
```

Then import a document like any other component:

```js
const posts = import.meta.glob('/src/content/*.md', { eager: true });
const { default: Post, metadata } = posts['/src/content/hello.md'];
```

## The one failure worth knowing up front

**Forgetting `.md` in `extensions`.** skavex emits valid Svelte, the Svelte
plugin ignores it for not being a Svelte file, and the browser is served
component source as a module. Nothing errors; the page is simply wrong.

## Without Vite

`compile` is the same pipeline as a function, for a script or a test:

```js
import { compile } from '@skavex/skavex';

const { code, metadata } = await compile(source, {
	components: 'src/lib/components/md'
});
```

`code` is Svelte source. `@skavex/skavex/browser` is the same thing minus the
one function that reads the filesystem, so it bundles for a browser or a
worker — see [Server and client rendering](rendering.md).
