import type { KnipConfig } from "knip";

const config: KnipConfig = {
	workspaces: {
		".": {
			// prettier.config.ts, eslint.config.ts, release.config.ts auto-detected by Knip plugins
			entry: ["commitlint.config.ts", "holocron.config.ts"],
			project: ["*.ts"],
		},
		"packages/cli": {
			entry: ["src/cli.ts", "src/index.ts", "src/capabilities/index.ts"],
			project: ["src/**/*.ts", "!src/**/__tests__/**"],
		},
		"packages/holocron-plugin-*": {
			entry: ["src/index.ts"],
			project: ["src/**/*.ts", "!src/**/__tests__/**"],
		},
	},
	// cli-utils is a private carryover package; its exports are intentionally
	// not wired into the module graph yet (cherry-picked into cli over time).
	ignore: ["packages/cli-utils/**"],
	ignoreDependencies: [
		// Loaded at runtime by the CLI plugin loader — not statically imported
		"@theholocron/holocron-plugin-1password",
		"@theholocron/holocron-plugin-clerk",
		"@theholocron/holocron-plugin-doppler",
		"@theholocron/holocron-plugin-github",
		"@theholocron/holocron-plugin-infisical",
		"@theholocron/holocron-plugin-neon",
		"@theholocron/holocron-plugin-postman",
		"@theholocron/holocron-plugin-vercel",
		// Private workspace dep — intentionally not wired into the module graph
		"@theholocron/cli-utils",
		// ESLint toolchain: per-package eslint.config.ts spreads the root config;
		// Knip's ESLint plugin doesn't trace through the spread
		"@theholocron/eslint-config",
		"@vitest/eslint-plugin",
		"eslint-plugin-n",
		"globals",
		// sub-package tsconfig.json files reference this via "extends";
		// hoisted to root devDeps for workspace access but Knip doesn't cross-track it
		"@theholocron/tsconfig",
		// commitlint uses string-based "extends", not a module import
		"@theholocron/commitlint-config",
		// passed as --config arg to lint-staged in .husky/pre-commit, not an import
		"@theholocron/lint-staged-config",
		// binary tools — invoked via CLI or hooks, not module imports
		"alexjs",
		"husky",
		"tsdown",
	],
	// commitlint binary comes transitively via @theholocron/commitlint-config; not a direct dep
	ignoreBinaries: ["commitlint"],
	ignoreExportsUsedInFile: true,
};

export default config;
