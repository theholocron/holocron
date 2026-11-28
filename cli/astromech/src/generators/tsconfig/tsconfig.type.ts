/** Options for a package's generated `tsconfig.json`. */
export interface TsconfigOptions {
	/** Human-readable name for the `display` field — the package's own name is the usual choice. */
	display: string;
	/**
	 * `@theholocron/tsconfig` variant. Defaults to `"node-lts"` — every
	 * checked package uses it; the other three (`astro`, `nextjs`, `react`)
	 * exist for a template repo's app-shaped packages, not the plain
	 * Node.js library packages this org's currently-migrated repos ship.
	 */
	variant?: "astro" | "nextjs" | "node-lts" | "react";
	/**
	 * Add a `@/*` → `./src/*` path alias. A real per-package choice, not a
	 * default — roughly 40% of packages checked use one, the rest don't.
	 */
	paths?: boolean;
}
