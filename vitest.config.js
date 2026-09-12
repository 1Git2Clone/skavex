import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		// Node: the engine runs at build time and the SSR suite imports compiled
		// server modules, neither of which wants a DOM.
		environment: 'node',
		include: ['test/**/*.test.js'],

		coverage: {
			provider: 'v8',
			// src/ only. bench/ and demo/ are arguments for the library rather than
			// part of it, and e2e/ covers the demo from the outside; counting them
			// would let a big well-exercised demo hide a thin patch in the engine.
			include: ['src/**/*.js'],
			reporter: ['text-summary', 'json-summary', 'lcov'],

			// Set just under what the suite currently reaches, so the gate catches a
			// real drop rather than flapping on a line moving between two files.
			// Functions is exact: every exported function is reachable from a test
			// today, and adding one that is not should be a deliberate decision.
			thresholds: { lines: 95, statements: 92, branches: 85, functions: 100 }
		}
	}
});
