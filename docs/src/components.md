# Components

Write a Svelte component as a bare tag in the markdown:

```markdown
<Counter start={3} />
```

Point `components` at a directory and skavex scans it, sees `<Counter` in the
output, and emits the import. Nothing else is needed.

```js
skavex({ components: '/src/lib/components/md' });
```

## Naming and discovery

A component's **name is its basename**, however deeply it is nested, so
`md/embeds/YouTube.svelte` is written `<YouTube />`. Names must start with a
capital — that is Svelte's rule for telling a component from an element, not
one skavex adds.

Two files with the same basename are ambiguous. The first found wins and the
duplicate is reported, so the build warns rather than silently binding the
wrong component.

Only components the document actually references are imported. A component
sitting in the directory unused costs nothing.

## A tag with nothing behind it

If a document names `<Counter />` and no such file exists, the generated Svelte
compiles to a reference to an undefined variable. It throws at mount, and the
message names the variable rather than the document.

`referencedComponents(html)` returns every name the markup uses, against which
`selectUsedComponents` returns only those that resolve — the difference is the
list of tags with no file behind them. The playground uses exactly this to turn
that failure into a sentence.

## Children are still markdown

A component can wrap prose rather than merely receive it:

```markdown
<Callout type="note">

**Bold text** and maths, $e^{i\pi} + 1 = 0$, inside the component.

</Callout>
```

```svelte
<script>
	let { type = 'note', children } = $props();
</script>

<aside data-type={type}>{@render children?.()}</aside>
```

**The blank lines are required.** With none, the content is a single HTML block
and its markdown stays literal:

```markdown
<Callout>
**not bold** — no blank lines, so this is raw HTML
</Callout>
```

That is CommonMark's HTML-block rule, and it applies identically in mdsvex.

## Indentation

Component tags survive indentation. Each of these renders a component:

| Where                    | Result    |
| ------------------------ | --------- |
| Top level                | component |
| Indented two spaces      | component |
| Indented three spaces    | component |
| Inside a list item       | component |
| Inside a nested list     | component |
| Inside a blockquote      | component |
| **Indented four spaces** | **code**  |

Four spaces is an indented code block. That is CommonMark, it is not a
limitation to work around, and a document that shows a component tag as an
example depends on it staying true. mdsvex behaves the same way — this is
parity, not an advantage.

Every row above is a test in `test/components.test.js`, so the table stays
true rather than staying written down.
