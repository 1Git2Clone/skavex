import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
	testDir: 'e2e',

	// The demo is what these tests are about, so they run against the real
	// production build rather than the dev server: a bug that only appears once
	// Vite has bundled and minified is exactly the kind the CI job exists to
	// catch, and it is the artifact that gets published.
	webServer: {
		command: `pnpm run demo:build && pnpm exec vite preview --config demo/vite.config.js demo --port ${PORT} --strictPort`,
		url: `http://localhost:${PORT}/`,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000
	},

	use: { baseURL: `http://localhost:${PORT}/` },

	// The CI runner shares a box with mail, git and a minecraft server, and a
	// render that takes 40 ms here can take a great deal longer there. These are
	// headroom for a contended machine, not cover for a slow app: every
	// assertion below still resolves in milliseconds when the box is idle.
	timeout: 60_000,
	expect: { timeout: 15_000 },

	// Chromium only. These assert that the library's output reaches the DOM, not
	// that browsers differ; a second engine would double the runtime of a job on
	// a box that is also serving mail and git for one more copy of the same
	// assertion.
	//
	// channel: 'chromium' launches the full Chromium build in headless mode
	// rather than the separate chrome-headless-shell, which is Playwright's
	// default and which flake.nix does not ship: the dev shell takes
	// playwright-driver.browsers-chromium, and that derivation carries
	// chromium-<rev> and ffmpeg alone. Without this the launch fails with
	// "Executable doesn't exist" and advises `playwright install`, which is
	// precisely what a pinned, offline CI must not do.
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'chromium' } }],

	// A flaky rerun locally is convenience; in CI it turns a real intermittent
	// failure into a green run, so it is off there.
	retries: process.env.CI ? 0 : 1,
	forbidOnly: Boolean(process.env.CI),
	reporter: process.env.CI ? 'list' : 'line'
});
