# Server and client rendering

skavex emits an **ordinary Svelte component**. It has no opinion about where
that component runs, and adds nothing that would stop it running anywhere — so
the choice between server rendering, client rendering, or both is SvelteKit's,
exactly as it is for a hand-written component.

## Server rendering

The default, and the reason the library exists. A document is HTML on first
paint: no markdown parser in the bundle, no formula being typeset on the main
thread while the reader waits, and nothing a crawler has to execute JavaScript
to see.

What that does _not_ promise is a better layout-shift score in every
environment; [Benchmarks](benchmarks.md) has the measurements where it does not
hold, and why.

Nothing needs configuring for this. A `.md` import in a SvelteKit route is
server-rendered like any other component.

## Client rendering

For an interaction-heavy page — a document that is mostly a live widget, or a
view behind a login that will never be crawled — the same component renders
client-side:

```js
// +page.js
export const ssr = false;
```

This is free, in the literal sense that skavex does nothing to enable it.
Worth knowing anyway, because the two ways it could have _failed_ are ones a
library like this often does fail:

- **No `node:` builtins in the emitted component.** Everything the document
  needs at runtime is Svelte and whatever its components import. The one
  function that touches the filesystem is `compile`, at build time.
- **No hydration mismatch to avoid.** The markup is produced at build time and
  is identical in both directions, so there is no "render once on the server,
  differently on the client" hazard.

## Rendering in a browser

`@skavex/skavex/browser` is the whole pipeline minus the filesystem: markdown
to HTML, and HTML to Svelte component source, both pure string work. It
bundles for a browser, a worker or an edge runtime as-is.

```js
import { render, buildModule, selectUsedComponents } from '@skavex/skavex/browser';

const { html, metadata } = await render(markdown);
const code = buildModule({ html, metadata, components: [] });
```

This is what the [playground](https://pages.hu-tao.dev/skavex/skavex/) runs. It
goes one step further and bundles the Svelte compiler too, so it can compile
`code` and mount the result — which is the client-rendering case taken to its
extreme, with no server involved at any point.

A test bundles this entry with Vite and fails if anything in its import graph
pulls in a node builtin, so the guarantee is checked rather than claimed.
