# Changelog

Notable changes per release. This file starts at 0.3.0; for 0.1.0 through
0.2.1, `git log` is the record.

## 0.3.0

Everything here is additive. No export was removed, no signature changed, and
no behaviour a 0.2.1 consumer relied on is different — the diff against `v0.2.1`
adds one entry point, one function and a more precise type, and nothing else.

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

- `any` is banned repo-wide and 59 uses are gone; tests, benchmarks, e2e and
  scripts are typechecked for the first time, as are `.svelte` files.
- Several casts that removed `null` rather than narrowing it — a missing
  element, an unbound socket, an absent map entry — now check and report.

### Infrastructure

- CI installs fonts, without which its browser laid out every page with zero
  metrics and produced Lighthouse scores of `0`.
- Benchmarks run pinned to dedicated cores (`pnpm bench:isolated`).
- Coverage is gated and published as a self-hosted badge.
- Renovate has a configuration; `@playwright/test` and the deliberately-old
  benchmark aliases are pinned with the reason recorded.
