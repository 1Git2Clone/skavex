# skavex

**Server-rendered Markdown + LaTeX for Svelte.** A Vite plugin that compiles
`.md` files into real Svelte components, so a document is HTML on first paint —
no markdown parser in the bundle, no maths rendering on the main thread, and
nothing a crawler has to run JavaScript to see.

There is a [live playground](https://pages.hu-tao.dev/skavex/skavex/). It is
the unusual case: it ships the whole pipeline _and_ the Svelte compiler to your
browser so it can rebuild as you type. A site built with skavex ships neither.

## Why this exists

[mdsvex](https://mdsvex.pngwn.io/) is not abandoned — it still ships releases.
It is _stuck_, and on something structural: its Svelte support is implemented
by patching the markdown parser's tokenizer table, an API that belongs to
**unified 8**.

```js
const block_tokenizers = this.Parser.prototype.blockTokenizers;
block_tokenizers.svelteBlock = parse_svelte_block;
block_tokenizers.svelteTag = parse_svelte_tag;
```

remark replaced its parser with **micromark** in unified 9, and `this.Parser`,
`blockTokenizers` and `blockMethods` went with it. Upgrading would mean
rewriting that parsing as micromark syntax extensions, so the releases that
ship are the ones that do not require it.

You meet this as silence. A modern remark plugin registers itself by pushing
onto `data.micromarkExtensions`, which mdsvex's parser never reads — legal to
write, so nothing errors, and the plugin is simply never consulted:

```text
mdsvex + remark-math 3   46 formulas rendered
mdsvex + remark-math 6    0 formulas rendered   <- no error, no warning
```

Nothing to search for, nothing in a stack trace. Pinning `remark-math@3` works,
but it pulls the whole unified 8 tree along with it and every modern remark
plugin added afterwards fails the same silent way.

skavex never extends the parser. Component tags arrive as ordinary HTML nodes
and survive by a rule about tree nodes — `text` is prose and gets escaped,
`raw` is deliberate markup and does not. Tree-level work outlives a unified
major; tokenizer-level work does not. That is why the unified version here is
yours to choose rather than ours to pin.

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
