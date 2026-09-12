/**
 * The document the editor opens with.
 *
 * Chosen to exercise every part of the pipeline at once: frontmatter that
 * becomes metadata, a heading whose id has to survive KaTeX, inline and
 * display maths, a GFM table, and a bare Svelte component tag — the thing a
 * markdown renderer normally cannot pass through.
 */
export const SAMPLE = `---
title: Sieve of Eratosthenes
tags: ['algorithms', 'number theory']
---

## Why $O(n \\log \\log n)$?

Crossing out the multiples of each prime $p \\le \\sqrt{n}$ costs $n/p$ writes,
so the total is

$$
\\sum_{p \\le n} \\frac{n}{p} = n \\sum_{p \\le n} \\frac{1}{p} \\sim n \\ln \\ln n
$$

by Mertens' second theorem.

### Comparison

| Approach          | Complexity        | Space  |
| ----------------- | ----------------- | ------ |
| Trial division    | $O(n\\sqrt{n})$   | $O(1)$ |
| Sieve             | $O(n\\log\\log n)$ | $O(n)$ |

A Svelte component, written as a bare tag in the markdown:

<Counter start={3} />

And prose containing {braces}, which Svelte would otherwise read as an
expression — skavex escapes text but leaves the component above alone.
`;
