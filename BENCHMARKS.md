# Benchmarks

Everything here is produced by code in `bench/`, not quoted from anywhere:

```sh
nix develop
pnpm bench           # build-time throughput and capability
pnpm bench:isolated  # the same, on CPUs nothing else is using
pnpm bench:web       # what the output costs a reader, via Lighthouse
pnpm bench:check     # both, failing on a regression — what CI runs
```

### Making the numbers reproducible

They move with whatever else the machine is doing, and two things take most of
that out.

**Samples are interleaved across engines.** Timing all of one engine's samples
and then all of the next means any drift in load lands entirely on whichever
engine was running at the time — and moves the ratio between them, which is
the only figure worth reporting. Round-robin instead: sample one of each, then
sample two, so a busy moment is shared.

**`pnpm bench:isolated` confines the run to its own cores**, via a transient
systemd scope — no daemon, no image, no root, and cgroups are what a container
would use for this anyway. Measured over five runs of the skavex-to-bare
ratio:

|                              | Range         | Spread   |
| ---------------------------- | ------------- | -------- |
| sequential, shared cores     | 1.17× – 1.47× | 0.30     |
| interleaved, shared cores    | 1.22× – 1.39× | 0.17     |
| interleaved, dedicated cores | 1.31× – 1.40× | **0.09** |

CI gets the interleaving but not the isolation: the runner is an unprivileged
container on a shared box and cannot pin itself to anything. That is one more
reason its gate is a ratio and never a millisecond count.

Numbers below were measured on 2026-09-12, node 26.8.1, on one workstation.
Treat the absolute milliseconds as machine-specific and the ratios and
capability columns as the findings.

## What is being compared

| Engine                     | What it is                                             |
| -------------------------- | ------------------------------------------------------ |
| **skavex**                 | this library — unified 11, KaTeX at build time         |
| **mdsvex + remark-math 3** | the newest maths plugins mdsvex can actually run       |
| **mdsvex + remark-math 6** | what a new project gets by installing current versions |

mdsvex appears twice on purpose, and leaving either row out would be
misleading. It pins **unified 8.4.2** (2020); remark and rehype moved to
unified 11 years ago. Pairing mdsvex with today's `remark-math` produces a
document with no maths in it and **no error of any kind** — so measuring only
that configuration would flatter it on speed and damn it on capability, and
measuring only the legacy pairing would hide the trap a new project falls
into.

## Build time

20 documents of blog-post length — prose, inline and display maths, a table
whose cells contain maths, code, headings — median of 7 samples.

| Engine                 | Per doc  | Throughput | KaTeX    | MathML   | Heading ids | Escapes prose | Keeps components | Compiles |
| ---------------------- | -------- | ---------- | -------- | -------- | ----------- | ------------- | ---------------- | -------- |
| skavex                 | 8.96 ms  | 111/s      | yes (46) | yes (16) | yes (3)     | yes           | yes              | yes      |
| mdsvex + remark-math 3 | 10.31 ms | 97/s       | yes (46) | yes (15) | no          | no            | yes              | **no**   |
| mdsvex + remark-math 6 | 3.37 ms  | 297/s      | **no**   | **no**   | no          | no            | yes              | **no**   |

### Reading this honestly

**Throughput is a tie.** Across repeated runs skavex came out between 1.01×
and 1.15× the working mdsvex configuration. That is noise on a warm machine,
and nobody should pick a markdown engine on it. The benchmark exists to prove
skavex is _not slower_, not to claim it is faster.

**`mdsvex + remark-math 6` is not fast, it is empty.** Its 3.37 ms is the cost
of skipping every formula. The KaTeX column is the same measurement expressed
as a capability: 46 rendered formulas against 0.

**MathML is the accessibility column.** KaTeX's HTML output renders visually
and is silent to a screen reader. skavex defaults to `htmlAndMathml` so
maths-heavy prose stays readable to one.

**"Compiles" means the Svelte compiler accepts the output.** Both mdsvex rows
fail it on this corpus, because the prose contains `{braces}` and Svelte reads
those as an expression. That is a documented mdsvex constraint rather than a
bug — you are expected to escape them by hand in every document. skavex
escapes text automatically and leaves component tags alone, which is what the
"Escapes prose" and "Keeps components" columns are showing together: the two
have to be true at once, or the feature is useless.

**Heading ids** are anchors and a table of contents. mdsvex can get them from
a plugin; out of the box it does not have them, and skavex derives them from
prose _before_ KaTeX runs so an id never changes when KaTeX changes its
markup.

## What it costs a reader

The build-time table is a developer's concern. This is the one a visitor
feels. Lighthouse, mobile profile, simulated throttling, on a page holding
eight documents' worth of maths.

The comparison is **server-rendered maths against client-rendered maths** —
because "render it in the browser with KaTeX auto-render" is exactly what a
project reaches for once it notices its maths never appeared. The client page
here is not a strawman: its body is literally the output of
`mdsvex + remark-math 6`, with KaTeX's own auto-render script wired up the way
its documentation recommends.

| Page                       | Performance | CLS       | LCP     | Blocking | JavaScript |
| -------------------------- | ----------- | --------- | ------- | -------- | ---------- |
| skavex — maths in the HTML | **96**      | **0.006** | 2254 ms | 0 ms     | **0 kB**   |
| client-side KaTeX          | 86          | 0.156     | 3208 ms | 6 ms     | 270 kB     |

`0.156` is the number that matters. Core Web Vitals calls anything above
`0.100` a failure, so a page that renders its maths in the browser fails on
layout shift — the text reflows underneath the reader as each formula is
replaced by a typeset one. And it pays 270 kB of JavaScript to get there,
against nothing at all.

## The CI gate

`pnpm bench:check` runs on every push and pull request. It deliberately
asserts **no absolute timing**. The runner shares a box with mail, git and a
Minecraft server, so a millisecond threshold would fail on a busy afternoon
and tell nobody anything.

What it does assert:

- **A ratio**, measured in the same process on the same machine within seconds
  of itself, so a loaded box moves both numbers together. skavex must stay
  above 0.9× the throughput of working mdsvex — a floor for catching a
  pipeline change that makes it materially slower, well below the measured
  1.0–1.15×.
- **Capability counts**, which are deterministic and so can be exact: rendered
  formulas, MathML nodes, heading ids, escaped prose, surviving component
  tags, and that the output compiles. Each one corresponds to something that
  has silently stopped working in a real project.
- **That server-rendered maths does not move the page** — CLS at or under
  0.100.

Lighthouse's trace engine gives up on a heavily loaded machine and returns NaN
for the timing-derived audits, so the table prints `n/a` for those rather than
a number that is not a measurement. Layout shift survives — it comes from
layout events rather than from the trace those audits need — which is
convenient, because it is the metric the claim rests on. On the CI runner the
client-rendered page measured **CLS 0.440**, considerably worse than the 0.156
on a quiet workstation: a slow machine is exactly where rendering maths in the
browser hurts most.

A count may grow when the corpus or KaTeX's markup changes. It may never
shrink, because shrinking is what a silent failure looks like.
