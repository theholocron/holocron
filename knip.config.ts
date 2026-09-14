import type { KnipConfig } from "knip";

const config: KnipConfig = {
	workspaces: {
		".": {
			// prettier.config.ts, eslint.config.ts, release.config.ts, astro.config.ts,
			// commitlint.config.ts (now that @commitlint/cli is a real dependency) —
			// all auto-detected by Knip plugins
			entry: ["holocron.config.ts", "astromech.config.ts"],
			project: ["*.ts"],
		},
		docs: {
			project: ["src/**/*.ts"],
		},
		"packages/cli": {
			// entry points auto-detected from package.json exports/bin
			entry: ["src/**/*.test.ts", "src/test-utils/*.ts"],
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
		"packages/datapad": {
			// src/index.ts auto-detected from package.json exports
			entry: ["src/**/*.test.ts"],
			project: ["src/**/*.ts"],
		},
		"packages/astromech": {
			// src/index.ts + src/config/index.ts auto-detected from package.json exports
			entry: ["src/**/*.test.ts"],
			project: ["src/**/*.ts"],
		},
	},
	ignoreDependencies: [
		// Loaded at runtime by the CLI plugin loader — not statically imported
		"@theholocron/holocron-plugin-1password",
		"@theholocron/holocron-plugin-axiom",
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
		// vitest config auto-loading is disabled for packages/cli (the rollup
		// plugin isn't built at audit time), so Knip can't trace this import
		"@theholocron/vitest-config",
		"@vitest/eslint-plugin",
		"eslint-plugin-n",
		"globals",
		// commitlint uses string-based "extends", not a module import
		"@theholocron/commitlint-config",
		// commitlint.config.ts's `extends: ["@theholocron"]` resolves via
		// commitlint's own shareable-config convention to the package above —
		// Knip's commitlint plugin doesn't follow that shorthand and reports
		// the literal string as an unlisted dependency
		"@theholocron",
		// satisfies @theholocron/commitlint-config's peerDependencies; nothing
		// in this repo extends it directly (only via "@theholocron" above)
		"@commitlint/config-conventional",
		// passed as --config arg to lint-staged in .husky/pre-commit, not an import
		"@theholocron/lint-staged-config",
		// required in devmoji.config.cjs via require() — not a static import Knip can trace
		"@theholocron/devmoji-config",
		// binary tools — invoked via CLI or hooks, not module imports
		"alexjs",
		// rollup-plugin-transform-template's tsdown.config.ts re-exports it
		// (`export { default } from "..."`) rather than importing + calling it —
		// Knip's dependency-usage graph doesn't trace through a bare re-export
		"@theholocron/tsdown-config",
	],
	ignoreExportsUsedInFile: true,
	// Declaration files for dotfile templates (.yamllint.yml, .yamlignore) — knip's
	// glob doesn't traverse dotfiles so it can't trace these as reachable from imports
	ignoreFiles: [
		"packages/cli/src/templates/configs/yamllint/.yamllint.yml.d.ts",
		"packages/cli/src/templates/configs/yamllint/.yamlignore.d.ts",
	],
};

export default config;
