import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		// Node: the engine runs at build time and the SSR suite imports compiled
		// server modules, neither of which wants a DOM.
		environment: 'node',
		include: ['test/**/*.test.js']
	}
});
