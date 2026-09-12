// remark-math@3 and rehype-katex@3 predate the ecosystem's TypeScript support,
// so they ship no declarations. They exist here only so the benchmark can build
// mdsvex in the one configuration where its maths actually renders; declaring
// them as unified plugins is enough for that, and is honest about what is
// known — the alternative is `any`, which this repository does not allow.
declare module 'remark-math-legacy' {
	import type { Plugin } from 'unified';
	const remarkMath: Plugin<[], import('mdast').Root>;
	export default remarkMath;
}

declare module 'rehype-katex-legacy' {
	import type { Plugin } from 'unified';
	const rehypeKatex: Plugin<[Record<string, unknown>?], import('hast').Root>;
	export default rehypeKatex;
}
