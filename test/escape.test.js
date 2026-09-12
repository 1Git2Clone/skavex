import { describe, expect, it } from 'vitest';
import { compile as compileSvelte } from 'svelte/compiler';
import { render } from '../src/index.js';
import { escapeText } from '../src/escape.js';

/**
 * Compile Svelte source and return its warnings, so a test can assert the
 * output is not merely a string but something the compiler accepts.
 *
 * @param {string} source
 */
function svelteWarnings(source) {
	return compileSvelte(source, { name: 'Doc', generate: 'server' }).warnings;
}

describe('escapeText', () => {
	it('escapes ampersands before introducing character references', () => {
		// If `&` were escaped last, the `&` of `&#123;` would itself be escaped
		// and a reader would see a literal "&#123;" on the page.
		expect(escapeText('a & {b}')).toBe('a &amp; &#123;b&#125;');
	});

	it('escapes angle brackets so text cannot become markup', () => {
		expect(escapeText('<div> {x}')).toBe('&lt;div&gt; &#123;x&#125;');
	});
});

describe('brace escaping through the pipeline', () => {
	it('escapes braces in prose so Svelte does not read them as expressions', async () => {
		const { html } = await render('Prose with {arr[i]} and {foo} in it.');
		expect(html).toContain('&#123;arr[i]&#125;');
		expect(html).toContain('&#123;foo&#125;');
	});

	it('does not double-escape into a visible entity', async () => {
		// The regression that a naive `node.value = ...` introduces: rehype-stringify
		// escapes text on the way out, turning `&#123;` into `&#x26;#123;`.
		const { html } = await render('Braces {here}.');
		expect(html).not.toContain('&#x26;');
		expect(html).not.toContain('&amp;#123;');
	});

	it('escapes braces inside inline code', async () => {
		const { html } = await render('Inline `{not_an_expression}` code.');
		expect(html).toContain('&#123;not_an_expression&#125;');
	});

	it('escapes braces inside fenced code', async () => {
		const { html } = await render('```py\nprint(f"{arr[i]}")\n```');
		expect(html).toContain('&#123;arr[i]&#125;');
	});

	it("escapes the LaTeX braces KaTeX embeds in MathML's annotation", async () => {
		// KaTeX writes the original TeX into <annotation>, so `\frac{n}{2}` arrives
		// as text full of braces. Missing this is a compile error in every post
		// that contains a fraction.
		const { html } = await render('$$\n\\frac{n(n+1)}{2}\n$$');
		expect(html).toMatch(/annotation[^>]*>[^<]*&#123;/);
		expect(html).toContain('katex-mathml');
	});

	it('leaves markup injected by a plugin untouched', async () => {
		/** A plugin that replaces a paragraph with a component. */
		const inject = () => (tree) => {
			tree.children[0] = {
				type: 'html',
				value: '<Widget count={3}>{@html `<b>hi</b>`}</Widget>'
			};
		};

		const { html } = await render('replace me', { remarkPlugins: [inject] });

		expect(html).toContain('<Widget count={3}>');
		expect(html).toContain('{@html `<b>hi</b>`}');
		// The braces that belong to the component must survive verbatim.
		expect(html).not.toContain('&#123;3&#125;');
	});

	it('produces output the Svelte compiler accepts', async () => {
		const { html } = await render(
			['Prose {with} braces.', '', '$$\n\\frac{a}{b}\n$$', '', '`{code}`'].join('\n')
		);

		expect(svelteWarnings(html)).toHaveLength(0);
	});

	it('is load-bearing: an unbalanced brace in prose is a Svelte parse error', () => {
		// Guards against the escaping quietly becoming a no-op. A lone `{` — an
		// everyday thing to write in prose — does not parse as Svelte at all.
		expect(() => svelteWarnings('<p>a lone { brace</p>')).toThrow();
	});

	it('is load-bearing: a balanced brace in prose is read as an expression', () => {
		// The quieter half of the same problem. `{arr[i]}` parses happily and
		// becomes an expression over a variable that does not exist, so the
		// reader loses the text even though nothing failed.
		// Unescaped, the braces become an interpolation: the literal never appears
		// in the output, and `arr` is evaluated at render time.
		const asExpression = compileSvelte('<p>{arr[i]}</p>', { name: 'D', generate: 'server' });
		expect(asExpression.js.code).not.toContain('<p>{arr[i]}</p>');

		// Escaped, it is inert text. Svelte decodes the character references on
		// the way out, so the reader still sees the braces they wrote.
		const asText = compileSvelte('<p>&#123;arr[i]&#125;</p>', {
			name: 'D',
			generate: 'server'
		});
		expect(asText.js.code).toContain('<p>{arr[i]}</p>');
	});
});
