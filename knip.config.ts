import type { KnipConfig } from "knip";

const config: KnipConfig = {
	workspaces: {
		".": {
			// prettier.config.ts, eslint.config.ts, release.config.ts, astro.config.ts
			// auto-detected by Knip plugins
			entry: ["commitlint.config.ts", "holocron.config.ts"],
			project: ["*.ts"],
		},
		docs: {
			project: ["src/**/*.ts"],
		},
		"packages/cli": {
			// entry points auto-detected from package.json exports/bin
			entry: ["src/**/*.test.ts"],
			project: ["src/**/*.ts"],
			// vitest.config.ts imports the rollup plugin which isn't built at
			// audit time — disable auto-loading so Knip uses our explicit entry
			vitest: { config: [] },
		},
		"packages/rollup-plugin-transform-template": {
			// src/index.ts auto-detected from package.json exports
			entry: ["src/**/*.test.ts"],
			project: ["src/**/*.ts"],
		},
		"packages/holocron-plugin-*": {
			// src/index.ts auto-detected from package.json exports
			entry: ["src/**/*.test.ts"],
			project: ["src/**/*.ts"],
		},
	},
	ignoreDependencies: [
		// Loaded at runtime by the CLI plugin loader — not statically imported
		"@theholocron/holocron-plugin-1password",
		"@theholocron/holocron-plugin-clerk",
		"@theholocron/holocron-plugin-cloudflare",
		"@theholocron/holocron-plugin-discord",
		"@theholocron/holocron-plugin-doppler",
		"@theholocron/holocron-plugin-fern",
		"@theholocron/holocron-plugin-github",
		"@theholocron/holocron-plugin-infisical",
		"@theholocron/holocron-plugin-neon",
		"@theholocron/holocron-plugin-posthog",
		"@theholocron/holocron-plugin-postman",
		"@theholocron/holocron-plugin-sentry",
		"@theholocron/holocron-plugin-slack",
		"@theholocron/holocron-plugin-vercel",
		// ESLint toolchain: per-package eslint.config.ts spreads the root config;
		// Knip's ESLint plugin doesn't trace through the spread
		"@theholocron/eslint-config",
		"@vitest/eslint-plugin",
		"eslint-plugin-n",
		"globals",
		// commitlint uses string-based "extends", not a module import
		"@theholocron/commitlint-config",
		// passed as --config arg to lint-staged in .husky/pre-commit, not an import
		"@theholocron/lint-staged-config",
		// required in devmoji.config.cjs via require() — not a static import Knip can trace
		"@theholocron/devmoji-config",
		// binary tools — invoked via CLI or hooks, not module imports
		"alexjs",
		"husky",
	],
	// commitlint binary comes transitively via @theholocron/commitlint-config; not a direct dep
	ignoreBinaries: ["commitlint"],
	ignoreExportsUsedInFile: true,
};

export default config;
