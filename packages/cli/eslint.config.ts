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
] satisfies Linter.Config[];
