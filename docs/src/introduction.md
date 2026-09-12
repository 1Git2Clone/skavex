# skavex

**Server-rendered Markdown + LaTeX for Svelte.** A Vite plugin that compiles
`.md` files into real Svelte components, so a document is HTML on first paint —
no markdown parser in the bundle, no maths rendering on the main thread, and
nothing a crawler has to run JavaScript to see.

There is a [live playground](https://pages.hu-tao.dev/skavex/skavex/). It is
the unusual case: it ships the whole pipeline _and_ the Svelte compiler to your
browser so it can rebuild as you type. A site built with skavex ships neither.

## Why this exists

[mdsvex](https://mdsvex.pngwn.io/) has been in maintenance mode for a long
time, and it bundles **unified 8** (2020). Modern `remark-math` and
`rehype-katex` target unified 11. Combining them does not error. It compiles
"successfully" and silently emits no maths at all:

```text
mdsvex + remark-math 3   46 formulas rendered
mdsvex + remark-math 6    0 formulas rendered   <- no error, no warning
```

There is nothing to search for and nothing in a stack trace. skavex owns its
pipeline, so the unified version is yours to choose.

## What it is not

**It is not a speed play.** Against the only mdsvex configuration that renders
maths it is a tie — this run has skavex ahead at 116 documents a second to 107,
and the two trade places within about 15% across runs. It costs about 1.26× a
hand-rolled unified 11 pipeline that does none of the work below and whose
output does not compile. Pick it for what it does, not for throughput. The
numbers, and the method that produced them, are in [Benchmarks](benchmarks.md).

**It is not a fork of mdsvex, and mdsvex is not broken.** Given the right
plugin versions mdsvex renders KaTeX correctly, handles indented component
tags, and parses markdown inside component children — all measured, all in
[Compared with mdsvex](comparison.md). The difference worth choosing on is
which unified you are allowed to use, not a list of things the other one
cannot do.

## The name

It alternates between the two things it joins:

| s                 | ka               | v                        | ex               |
| ----------------- | ---------------- | ------------------------ | ---------------- |
| **S**&#8203;velte | **Ka**&#8203;TeX | S&#8203;**v**&#8203;elte | Ka&#8203;**TeX** |
