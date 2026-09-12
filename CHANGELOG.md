# Changelog

Notable changes per release. This file starts at 0.3.0; for 0.1.0 through
0.2.1, `git log` is the record.

## 0.4.0

### Changed — metadata is generic, and `headings` is no longer special

skavex had one option, `headings`, that collected a table of contents onto
`metadata.headings`, on by default, with a field spelled out in
`DocumentMetadata` for it. Nothing else the document tree can produce got that
treatment — not a reading time, not the outbound links, not the languages of
the code blocks, not a word count — which made the core of the library carry one
project's requirement as if it were everybody's.

It is now what it always was underneath: a plugin.

```js
// before — always on, configured through the pipeline
skavex({ headings: { levels: [2, 3] } });

// after — opt in, like any other plugin
import { rehypeHeadings } from '@skavex/skavex/plugins';

skavex({ rehypePlugins: [[rehypeHeadings, { levels: [2, 3] }]] });
```

`rehypePlugins` is the stage that runs before KaTeX, so the ordering guarantee
the collector depends on — ids derived from the prose rather than from KaTeX's
markup — is preserved by putting it there. It is the same plugin, unchanged.

**This is breaking in three ways:**

- The `headings` option is gone. Passing it warns once and is otherwise
  ignored — an ignored option looks exactly like a working one until someone
  notices the table of contents is empty. TypeScript callers get an
  excess-property error instead. The warning goes away in 0.5.0.
- Headings no longer get ids unless the plugin is on. Anchors, and any
  `#fragment` link into a document, depend on it.
- `DocumentMetadata` is now plain `Record<string, unknown>`, so
  `metadata.headings` is typed `unknown` and needs narrowing at the point of
  use:

  ```ts
  import type { HeadingEntry } from '@skavex/skavex/plugins';

  const headings = metadata.headings as HeadingEntry[] | undefined;
  ```

That last one is the deliberate part rather than a side effect. Only the project
knows what its own pipeline produces, and a core type that names one plugin's
output while every other plugin's is `unknown` is not a generic type — it is a
list of whichever features happened to ship in the box.

### Added

- **`setMetadata(file, values)`** in `@skavex/skavex/utils` — the whole of the
  metadata contract, made explicit. Merges rather than assigns, so a plugin
  cannot erase what ran before it; `file.data.fm = {...}` is the same operation
  minus that guarantee, and discards frontmatter whenever it runs second. Both
  bundled plugins now go through it, and have no standing a plugin you write
  does not.

## 0.3.0

### Changed — the public API is now a decision rather than a leftover

The main entry exported thirteen things, ten of which were internals that ended
up there because something once needed them: `escapeText`, `findComponents`,
`resolveComponentsDir`, `selectUsedComponents`, `createProcessor`,
`buildModule` and three unified plugins, all sitting beside `compile`.

It is now three functions, and the rest lives where it belongs:

| Entry                    | Exports                                                                  |
| ------------------------ | ------------------------------------------------------------------------ |
| `@skavex/skavex`         | `compile`, `render`, `slugify`                                           |
| `@skavex/skavex/vite`    | `skavex`                                                                 |
| `@skavex/skavex/browser` | the pipeline minus anything touching the filesystem                      |
| `@skavex/skavex/plugins` | `rehypeHeadings`, `remarkExtractFrontmatter`, `rehypeEscapeSvelteBraces` |
| `@skavex/skavex/utils`   | helpers for writing a plugin that injects a component                    |

**This is breaking if you imported one of those ten from the main entry.** The
fix is a different specifier, not different code — `/plugins` for the three
plugins, `/browser` for `createProcessor` and `buildModule`. `escapeText`,
`findComponents` and `resolveComponentsDir` are no longer public; open an issue
if you were using one.

Done now, deliberately, while `0.x` still permits it. The point of trimming
before `1.0.0` is that a published export is a promise, and ten of them were
never meant as promises. `test/api.test.js` now pins the surface entry by entry,
so the next addition has to be written down before it ships.

### Added

- **`@skavex/skavex/browser`** — the half of the pipeline that touches no
  filesystem: `render`, `createProcessor`, `buildModule`,
  `selectUsedComponents`, `referencedComponents`. It bundles for a browser, a
  worker or an edge runtime as-is. A test bundles this entry with Vite and
  fails if anything in its import graph pulls in a node builtin, so the
  guarantee is checked rather than claimed.
- **`referencedComponents(html)`** — every component name a document's markup
  references, whether or not a file defines it. `selectUsedComponents` returns
  only the ones that resolve, so the difference between them is the list of
  tags that will compile to an undefined variable and throw at mount.
- **`bugs`, `homepage` and `sideEffects` in `package.json`** — the first two so
  npm links back to the forge and the documentation; the third so a bundler can
  drop unused exports from a client bundle.
- **Documentation**: an [mdBook](https://pages.hu-tao.dev/skavex/skavex/docs/)
  covering component children, indentation, plugins, server versus client
  rendering, the options reference, and a measured comparison with mdsvex.
- **A playground** at [pages.hu-tao.dev/skavex/skavex](https://pages.hu-tao.dev/skavex/skavex/)
  that compiles and mounts what it renders, with an editable file tree of
  components and remark plugins.
- **CONTRIBUTING.md**, stating where contributions actually happen.
- **`.pre-commit-config.yaml`**, run both by the local hooks and by CI, so the
  two cannot drift. Formatting, lint and a gitleaks scan on commit; typecheck
  and unit tests on push. All tools come from the flake rather than `$PATH`, so
  an editor and a terminal get the same versions.
- **`renovate.json5` is validated**, by `renovate-config-validator` from a
  dedicated dev shell and a pre-push hook scoped to that file. The failure it
  guards against is silent: Renovate ignores a misspelled key rather than
  erroring, so a rule quietly stops applying — `matchPackageNamez` validates as
  "a rule with no selector", which is how the `@playwright/test` pin would come
  back to life unnoticed.
- **Third-party plugin coverage.** `test/plugins.test.js` runs the real
  `remark-directive` and `rehype-external-links` against the pipeline, including
  a directive turned into a Svelte component with prose braces still escaped
  correctly around it.

### Changed

- `render`'s `metadata` is now `DocumentMetadata` rather than
  `Record<string, unknown>`, so reading `metadata.headings` no longer requires a
  cast. Strictly more information; existing code keeps typechecking.
- **Benchmarks are honest about what they measure.** The suite gained a
  hand-rolled unified 11 baseline and an mdsvex SSR control, and the
  documentation was rewritten around them. Against the only mdsvex
  configuration that renders maths, skavex is at parity. See
  [BENCHMARKS.md](BENCHMARKS.md).
- **A published benchmark conclusion was withdrawn.** Earlier versions reported
  a CI layout-shift figure that had been measured in a container with no fonts,
  where text lays out with zero metrics and the numbers mean nothing. The
  correction is recorded in BENCHMARKS.md rather than quietly removed.

### Fixed

- **Prettier never checked a single `.svelte` file.** Without
  `prettier-plugin-svelte` it does not recognise the extension, and
  `prettier --check .` skips what it cannot parse instead of failing — so the
  demo's largest component had never been formatted. The plugin is now
  configured and the files are formatted.
- `any` is banned repo-wide and 59 uses are gone; tests, benchmarks, e2e and
  scripts are typechecked for the first time, as are `.svelte` files.
- Several casts that removed `null` rather than narrowing it — a missing
  element, an unbound socket, an absent map entry — now check and report.

### Infrastructure

- **Published to the Forgejo package registry** as well as npm, at the same
  version, by `.forgejo/workflows/publish.yml` on a tag. npm stays the canonical
  copy and is still published by hand, because publishing there is irreversible
  and should not be something a push can do on its own.

- CI installs fonts, without which its browser laid out every page with zero
  metrics and produced Lighthouse scores of `0`.
- Benchmarks run pinned to dedicated cores (`pnpm bench:isolated`).
- Coverage is gated and published as a self-hosted badge.
- Renovate has a configuration; `@playwright/test` and the deliberately-old
  benchmark aliases are pinned with the reason recorded.
