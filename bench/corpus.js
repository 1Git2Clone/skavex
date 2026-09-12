/**
 * The documents the benchmark runs on.
 *
 * Shaped like the posts this library exists for rather than like a synthetic
 * stress test: prose with inline maths, a display equation, a table whose
 * cells contain maths, code, and headings an engine has to slug. A corpus of
 * pure prose would measure markdown parsing and nothing that distinguishes
 * these engines.
 *
 * @module
 */

/**
 * One document of roughly blog-post length.
 *
 * @param {number} n Varies the content so a cache cannot flatter one engine.
 * @returns {string}
 */
export function document(n) {
	return `---
title: Complexity notes ${n}
tags: ['algorithms', 'analysis']
date: 2026-0${(n % 9) + 1}-12
---

## Bounding the ${n}th sum

For every $k \\le ${n + 2}$ the partial sum $S_k = \\sum_{i=1}^{k} 1/i$ satisfies

$$
\\ln(k + 1) \\le S_k \\le 1 + \\ln k,
$$

which is enough to show the harmonic series diverges at rate $\\Theta(\\log k)$.

### Why the sieve is $O(n \\log \\log n)$

Crossing out multiples of each prime $p \\le \\sqrt{n}$ costs $n/p$ writes, so
the total is $n \\sum_{p \\le n} 1/p \\sim n \\ln \\ln n$ by Mertens' theorem.

| Approach       | Time                  | Space    |
| -------------- | --------------------- | -------- |
| Trial division | $O(n\\sqrt{n})$        | $O(1)$   |
| Sieve          | $O(n \\log \\log n)$   | $O(n)$   |
| Segmented      | $O(n \\log \\log n)$   | $O(\\sqrt{n})$ |

\`\`\`python
def sieve(n: int) -> list[int]:
    flags = bytearray([1]) * (n + 1)
    for p in range(2, int(n**0.5) + 1):
        if flags[p]:
            flags[p * p :: p] = bytearray(len(flags[p * p :: p]))
    return [i for i in range(2, n + 1) if flags[i]]
\`\`\`

### Notes

- The bound is tight to within $O(1)$.
- Prose with {braces} in it, which a Svelte compiler would otherwise read as an
  expression.
- A component tag: <Counter start={${n}} />

See the [analysis](https://example.invalid/analysis) for the full derivation.
`;
}

/**
 * @param {number} count
 * @returns {string[]}
 */
export function corpus(count) {
	return Array.from({ length: count }, (_, index) => document(index));
}
