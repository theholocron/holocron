import type { KnipConfig } from "knip";

// The shareable config packages export their built files from dist/ (package.json exports), which knip cannot map
// back to the sources, and their sources are all public entry points (config files, bundles, presets, setup files),
// so every source file outside the build output is an entry.
function configPackage(ignoreDependencies: string[] = []) {
	return {
		entry: ["**/*.ts", "!dist/**"],
		project: ["**/*.ts", "!dist/**"],
		...(ignoreDependencies.length > 0 ? { ignoreDependencies } : {}),
	};
}

const config: KnipConfig = {
	workspaces: {
		".": {
			// prettier.config.ts, eslint.config.ts, astro.config.ts, commitlint.config.ts —
			// all auto-detected by Knip plugins
			// scripts/*.mjs are run by the repoValidation tasks
			// tsdown.config.ts is the one build config every package without its own inherits (tsdown walks up to it)
			entry: [
				"holocron.config.ts",
				"astromech.config.ts",
				"release.config.ts",
				"tsdown.config.ts",
				"scripts/*.mjs",
			],
			project: ["*.ts", "scripts/*.mjs"],
			// release.config.ts returns inline plugin objects (the folder-scoped commit analyzers), which the
			// plugin reads as package names and crashes on, so it is an entry here instead.
			"semantic-release": false,
			// `holocron probe docs coverage` runs the repo's own TypeDoc, found by resolving it at run time
			ignoreDependencies: ["typedoc"],
		},
		docs: {
			project: ["src/**/*.ts"],
		},
		"cli/cli": {
			// entry points auto-detected from package.json exports/bin
			entry: ["src/**/*.test.ts", "src/testing/*.ts"],
			project: ["src/**/*.ts"],
			// vitest.config.ts imports the rollup plugin which isn't built at
			// audit time — disable auto-loading so Knip uses our explicit entry
			vitest: { config: [] },
		},
		"plugins/holocron-plugin-*": {
			// src/index.ts auto-detected from package.json exports
			entry: ["src/**/*.test.ts"],
			project: ["src/**/*.ts"],
		},
		"cli/datapad": {
			// src/index.ts auto-detected from package.json exports
			entry: ["src/**/*.test.ts"],
			project: ["src/**/*.ts"],
		},
		"cli/astromech": {
			// src/index.ts + src/config/index.ts auto-detected from package.json exports
			entry: ["src/**/*.test.ts"],
			project: ["src/**/*.ts"],
			// notify.test.ts runs the action's real shell script, which needs jq -- a
			// system tool on every CI runner and dev machine, not an npm dependency.
			ignoreBinaries: ["jq"],
		},
		observability: {
			// src/index.ts and the subpath entries are auto-detected from package.json exports
			entry: ["src/**/*.test.ts"],
			project: ["src/**/*.ts"],
			// pino transport targets, loaded by name at runtime (src/logger/transports.ts), never imported;
			// optional peers of the package, installed here for its tests
			ignoreDependencies: ["@axiomhq/pino", "pino-pretty"],
		},
		skills: {
			// the package ships markdown skills; only its node:test suite (test/index.mjs, found from
			// the test script) is code
			project: ["test/**/*.mjs"],
		},
		"clients/*": {
			// the public entry (package.json exports point at dist/, which knip cannot map back for every package)
			entry: ["src/index.ts", "src/**/*.test.ts"],
			project: ["src/**/*.ts"],
		},
		"clients/confluence-client": {
			entry: ["src/index.ts", "src/**/*.test.ts", "examples.ts"],
			project: ["src/**/*.ts"],
		},
		"clients/zendesk-client": {
			entry: ["src/index.ts", "src/**/*.test.ts", "examples.ts"],
			project: ["src/**/*.ts"],
		},
		"utils/*": {
			// the public entry (package.json exports point at dist/, which knip cannot map back for every package)
			entry: ["src/index.ts", "src/**/*.test.ts"],
			project: ["src/**/*.ts"],
		},
		"themes/*": {
			// the Starlight plugin's three entry points (package.json exports point at dist/); astro and starlight are peers
			entry: ["src/index.ts", "src/content.ts", "src/loader.ts", "src/**/*.test.ts"],
			project: ["src/**/*.ts"],
		},
		"configs/*": configPackage(),
		// no TypeScript in these two (a JSON config and a CommonJS entry point)
		"configs/browserslist-config": {},
		"configs/tsconfig": {},
		// the tools these packages configure are optional peers they reference but do not install
		"configs/eslint-config": configPackage([
			"@next/eslint-plugin-next",
			"eslint-plugin-cypress",
			"eslint-plugin-jsdoc",
			"eslint-plugin-react",
			"eslint-plugin-storybook",
		]),
		"configs/storybook-config": configPackage([
			"@storybook/addon-viewport",
			"axe-playwright",
			"msw-storybook-addon",
			"playwright",
		]),
		"configs/vite-config": configPackage(["@vitejs/plugin-react"]),
		// its built .d.ts files (reached through package.json exports) reference vite, which the package takes as a peer
		"configs/vitest-config": configPackage([
			"@storybook/addon-vitest",
			"@testing-library/jest-dom",
			"@vitest/browser-playwright",
			"vite",
		]),
		"apps/comlink": {
			// The Worker (src/worker.ts) is found through the tsdown config. holocron.config.ts imports the CLI.
			entry: ["src/**/*.test.ts", "holocron.config.ts"],
			project: ["src/**/*.ts"],
		},
		"apps/sentinel": {
			// src/index.ts auto-detected from package.json exports
			entry: ["src/**/*.test.ts"],
			project: ["src/**/*.ts"],
			// Imported only by inlined workspace code in dist/ (@theholocron/cli:
			// @napi-rs/keyring, @theholocron/git-utils, @theholocron/pkg-utils;
			// @theholocron/astromech/lint: @commitlint/lint;
			// @theholocron/datapad: object-utils), never by sentinel's own src/
			// (holocron#922);
			// declared so the trimmed deploy package.json installs them on Vercel.
			ignoreDependencies: [
				"@commitlint/lint",
				"@napi-rs/keyring",
				"@theholocron/git-utils",
				"@theholocron/object-utils",
				"@theholocron/pkg-utils",
			],
		},
	},
	ignoreDependencies: [
		// The root tsdown.config.ts builds every package without its own config, so the packages no longer import
		// the preset themselves. They keep the devDependency anyway: it makes turbo build the preset's dist first
		// (`^delivery.build`), which the root config imports.
		"@theholocron/tsdown-config",
		// Loaded at runtime by the CLI plugin loader — not statically imported
		"@theholocron/holocron-plugin-1password",
		"@theholocron/holocron-plugin-axiom",
		"@theholocron/holocron-plugin-checkly",
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
		// vitest config auto-loading is disabled for cli/cli (the rollup
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
		// never invoked directly (.husky/commit-msg calls `holocron run lint
		// commit-msg` instead) -- kept as a devDependency purely because its
		// presence is what activates Knip's own commitlint plugin, which is
		// what makes commitlint.config.ts count as a real entry point at all.
		// Removing this dependency breaks that detection instead of finding
		// a genuinely unused package -- confirmed live.
		"@commitlint/cli",
		// resolved dynamically by validateConfig() when a consuming repo's
		// holocron.config.ts imports it -- never a static import in Sentinel's
		// own source (holocron#782)
		"@theholocron/holocron-config",
		// passed as --config arg to lint-staged in .husky/pre-commit, not an import
		"@theholocron/lint-staged-config",
		// required in devmoji.config.cjs via require() — not a static import Knip can trace
		"@theholocron/devmoji-config",
		// binary tools — invoked via CLI or hooks, not module imports
		"alexjs",
		// invoked by @theholocron/lint-staged-config's package.json rule
		// ("package.json": "sort-package-json"), not a module import
		"sort-package-json",
	],
	ignoreExportsUsedInFile: true,
	// Declaration files for dotfile templates (.yamllint.yml, .yamlignore) — knip's
	// glob doesn't traverse dotfiles so it can't trace these as reachable from imports
	ignoreFiles: [
		"cli/astromech/src/templates/configs/yamllint/.yamllint.yml.d.ts",
		"cli/astromech/src/templates/configs/yamllint/.yamlignore.d.ts",
	],
};

export default config;
