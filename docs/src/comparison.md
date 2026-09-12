# Compared with mdsvex

Everything on this page was measured, most of it against mdsvex running in
this repository's own `node_modules`. Where mdsvex does the same thing, it says
so.

## The difference that decides it

mdsvex pins **unified 8**. `remark-math@6` and `rehype-katex@7` target unified 11. Put them together and nothing errors — the build succeeds and the maths is
simply absent:

| Setup                  | Formulas rendered | Error? |
| ---------------------- | ----------------- | ------ |
| mdsvex + remark-math@3 | 46                | —      |
| mdsvex + remark-math@6 | **0**             | none   |
| skavex                 | 46                | —      |

The failure has no message, no warning and no stack trace, and the two plugin
versions are not distinguishable from a `package.json` at a glance. This is the
reason skavex exists.

**mdsvex is not broken.** Given `remark-math@3` and `rehype-katex@3` it renders
all 46 formulas correctly. The problem is that the working combination is the
old one, and every modern instruction on the internet installs the other.

## Things people assume differ, that do not

Each of these was run through both libraries. All of them behave identically:

| Case                                             | skavex  | mdsvex  |
| ------------------------------------------------ | ------- | ------- |
| Component tag indented two or three spaces       | works   | works   |
| Component tag inside a list item                 | works   | works   |
| Component tag inside a nested list               | works   | works   |
| Component tag inside a blockquote                | works   | works   |
| Component tag indented four spaces               | code    | code    |
| Markdown inside component children (blank lines) | works   | works   |
| Markdown inside component children (no blanks)   | literal | literal |

Indentation is parity. Four-space indentation becoming a code block is
CommonMark in both. If you have read that mdsvex cannot handle indented
components, that is not what these measurements show.

The one difference inside that group: maths in component children. `$x^2$`
inside a `<Callout>` renders with skavex and stays literal with mdsvex — which
is the version trap above, not a separate limitation.

## Things that do differ

|                               | skavex     | mdsvex      |
| ----------------------------- | ---------- | ----------- |
| unified version               | yours (11) | 8, pinned   |
| Heading ids                   | yes        | no          |
| `metadata.headings` for a TOC | yes        | no          |
| Maths rendered in TOC entries | yes        | n/a         |
| Actively developed            | yes        | maintenance |

## Speed

skavex is **not faster**. Per document, on the benchmark corpus:

| skavex  | hand-rolled unified 11 | mdsvex + math 3 | mdsvex + math 6 |
| ------- | ---------------------- | --------------- | --------------- |
| 8.41 ms | **7.18 ms**            | 9.37 ms         | 2.98 ms         |

Against mdsvex it is a tie. Against the same pipeline wired by hand it is 20–50%
slower, because it collects headings, renders their maths, and escapes prose
while leaving component tags alone. The `remark-math 6` column is fast because
it is doing nothing.

[Benchmarks](benchmarks.md) has the method, the hardware controls, and how to
reproduce it.

## When to use mdsvex instead

If you do not use maths, your pipeline is happy on unified 8, and it already
works — there is nothing here worth a migration for.
