# Changelog

Notable changes per release. This file starts at 0.3.0; for 0.1.0 through
0.2.1, `git log` is the record.

## 0.4.1

No change to `src/`. The compiler, the options and every export are byte for
byte what 0.4.0 shipped; this release exists for a corrected README and for the
toolchain that builds the tarball.

### Fixed

- **The README described mdsvex as unmaintained.** It is not — it shipped 0.12.8.
  It is _stuck_, on something structural: its Svelte support patches the markdown
  parser's tokenizer table, an API belonging to unified 8. That is a different
  claim and a fairer one, and both the README and the book now make it.

### Infrastructure

Nothing below reaches a consumer. It is recorded because the tarball is now
built by a different compiler than 0.4.0's was.

- **TypeScript 7**, as `@typescript/native`. It cannot simply replace
  TypeScript 6: `svelte-check` refuses to start unless both are installed and it
  is given `--tsgo`, and `typescript-eslint` caps its peer range below 6.1. So
  the package named `typescript` stays on 6 and 7 arrives beside it. Both ship a
  `tsc` binary, so `build` and `check` name the one they mean rather than
  inheriting whichever pnpm linked last. The declaration output differs from 6's
  only in spelling — `export declare function` for `export function`, single
  quotes for double — and not in a single type.
- **Vitest 5**, and lock file maintenance across npm and nixpkgs: node 26.8.2,
  pnpm 11.27.0, `@playwright/test` 1.63.0 to match the driver the flake pins.
- **The dev shell takes `playwright-driver.browsers-chromium`** rather than all
  three engines. `playwright.config.js` has always declared one project, so
  Firefox and WebKit were closure the suite never launched — paid for on every
  push by a runner that keeps no cache, and, when nixos-unstable shipped a
  `playwright-webkit` that fails auto-patchelf, enough to take the whole shell
  down. That derivation carries the full Chromium build but not the separate
  `chrome-headless-shell`, hence `channel: 'chromium'` in the config and in the
  web benchmark.
- **Prettier normalises emphasis to underscores**, which the 0.4.0-era docs
  commit did not, so `pre-commit run --all-files` had failed on every push and
  pull request since — including four Renovate branches, which cut from a main
  that was already red.
- **Renovate's rule pinning `remark-math-legacy` and `rehype-katex-legacy` to
  the unified 8 era had never fired.** They are npm aliases, and
  `matchPackageNames` compares the registry name rather than the key in
  `package.json`, so a list of alias names matched nothing. It is `matchDepNames`
  now. Matching on the registry name is not the fix: that would also disable the
  real `remark-math` the library depends on.

## 0.4.0

### Removed — headings, tables of contents, and the metadata shape

skavex had a `headings` option that collected a table of contents onto
`metadata.headings`, on by default, with a field spelled out in
`DocumentMetadata` for it and a hand-written slugger behind it. Nothing else a
document tree can produce got that treatment — not a reading time, not the
outbound links, not the languages of the code blocks, not a word count, not the
footnotes. It was one project's navigation living in the core of a library
whose scope is unified 11 for server-rendered Svelte, LaTeX and Markdown.

It is gone. Not demoted to an opt-in plugin — gone, along with `slugify` and
`HeadingEntry`. Heading ids are
[`rehype-slug`](https://github.com/rehypejs/rehype-slug), which does
deduplication properly via `github-slugger`; a table of contents is a walk over
the same tree in whatever shape your navigation needs. Both are ordinary rehype
plugins, both are written for unified 11, and both run here unmodified — which
is the entire reason to be on unified 11.

```js
// before
skavex({ headings: { levels: [2, 3] } });

// after
import rehypeSlug from 'rehype-slug';

skavex({ rehypePlugins: [rehypeSlug, yourTocPlugin] });
```

What skavex still contributes is the **ordering**: `rehypePlugins` runs before
KaTeX, so a plugin reading a heading sees `$O(\log n)$` rather than
`<span class="katex">…`. Run a slugger after KaTeX and every anchor changes
whenever KaTeX changes its markup. That guarantee is a pipeline's to own. The
walk is not.

The playground's `contents` plugin is the replacement, editable in the browser:
the whole feature, about forty lines, owned by the project that wants it.

**Breaking:**

- `headings` option: removed. Passing it warns once and is otherwise ignored —
  an ignored option looks exactly like a working one until someone notices the
  table of contents is empty. TypeScript callers get an excess-property error
  instead. The warning goes away in 0.5.0.
- `slugify`: removed from `@skavex/skavex`.
- `rehypeHeadings` and `HeadingEntry`: removed from `@skavex/skavex/plugins`,
  which is now the two plugins the pipeline cannot do without and nothing else.
- `DocumentMetadata` is plain `Record<string, unknown>`. Only the project knows
  what its own pipeline produces, so values arrive typed `unknown` and get
  narrowed where they are consumed.
- Headings get no ids unless you add a plugin that assigns them. Every
  `#fragment` link into a document depends on it.

There is no replacement API for any of it, and deliberately no helper for
contributing metadata either. A plugin writes `file.data.fm`, which is vfile's
convention rather than skavex's, spreading what is there instead of assigning
over it. skavex writes exactly one key of its own — the document's
frontmatter — and a plugin you write has the same standing as that.

### Fixed

Found by a new adversarial test suite (`test/edge-cases.test.js`) that asks what
a real post contains that nobody thought about — a tutorial whose code samples
are Svelte, a title that is an emoji, frontmatter that is a YAML list. Every
payload is compiled through to the Svelte compiler, because the failures that
matter most happen a stage after the HTML.

- **Braces in HTML attributes were not escaped.** Svelte reads
  `title="a {b} c"` as an interpolated attribute, so an image whose alt text or
  title contained braces lost it — quietly, since an expression over an
  undefined variable renders as nothing rather than failing. An element with a
  braced attribute now has its tags serialised and passed through as raw markup,
  which nothing escapes a second time. A character reference in the property
  does not work: `hast-util-to-html` escapes `&` in an attribute value, so
  `&#123;` would reach the page as `&#x26;#123;`. Prose, code spans and KaTeX's
  MathML annotation were already covered; attributes were the gap.
- **Frontmatter that is a YAML list.** `typeof [] === 'object'`, so a block of
  `- a` spread into the metadata as `{0: 'a'}`. A non-mapping frontmatter block
  is now ignored, as a scalar and an empty one already were.

Two limitations are now pinned by tests rather than left to be discovered: a
raw `<script>` block in a document collides with the one skavex generates and
Svelte permits only one, and raw HTML written in uppercase (`<BR>`) is read by
Svelte as a component tag. Neither is fixable without rewriting what the author
wrote; both now fail against a test that says so.

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
