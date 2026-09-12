import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';

// pages.hu-tao.dev serves /<owner>/<repo>/ straight off disk with no rewriting,
// so the built asset URLs have to carry that prefix. .forgejo/workflows/pages.yml
// passes it; a local `pnpm demo` gets the default.
const base = process.env.BASE_PATH ? `${process.env.BASE_PATH}/` : '/';

export default defineConfig({
	base,
	plugins: [svelte()],
	resolve: {
		alias: {
			// The demo imports the package's public specifier rather than a relative
			// path, so it is exercising the same entry a consumer gets — and it fails
			// here if that entry ever stops being browser-safe.
			'@skavex/skavex/browser': fileURLToPath(new URL('../src/browser.js', import.meta.url))
		}
	},
	build: { outDir: 'dist', emptyOutDir: true }
});
