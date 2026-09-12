/**
 * Declarations for the Svelte runtime modules compiled output imports.
 *
 * Svelte ships no `.d.ts` for its internals, and `declare module 'x';` would
 * make each one `any` — the exact silence this repo bans. The playground never
 * calls into them by name: it enumerates their exports to build a re-exporting
 * shim. So an index signature is not a placeholder here, it is the true shape
 * of how they are used.
 */

declare module 'svelte/internal/client' {
	const exported: Record<string, unknown>;
	export = exported;
}

declare module 'svelte/internal/disclose-version' {
	const exported: Record<string, unknown>;
	export = exported;
}

declare module 'svelte/internal/flags/legacy' {
	const exported: Record<string, unknown>;
	export = exported;
}

declare module 'svelte/internal/flags/async' {
	const exported: Record<string, unknown>;
	export = exported;
}
