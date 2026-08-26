import type { Linter } from "eslint";

import root from "../../eslint.config.js";

export default [
	...root,
	{
		// Shebang is injected by tsdown at build time — the source file has none.
		files: ["src/cli.ts"],
		rules: { "n/hashbang": "off" },
	},
	{ ignores: ["dist/**", "coverage/**"] },
	{
		// types conditions point at ./src/**/*.ts so workspace consumers (and self-imports)
		// resolve without needing a prior build. publishConfig.exports overrides these to
		// ./dist/**/*.d.mts for the published package.
		rules: {
			"package-json/require-types-in-exports": "off",
			"package-json/prefer-files-field": "off",
		},
	},
] satisfies Linter.Config[];
