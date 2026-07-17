import type { Linter } from "eslint";
import { library } from "@theholocron/eslint-config/bundles/library";
import { vitest } from "@theholocron/eslint-config/vitest";

export default [
	...library(),
	...vitest(),
	{
		// eslint-plugin-n defaults to Node >=16 when engines.node is absent from
		// a package — override at workspace level to match our engines requirement.
		// TODO: move engines.node into each package.json instead (#111 follow-up).
		settings: { node: { version: ">=22.0.0" } },
		rules: {
			// src/ files are compiled to dist/ by tsdown; `files` in package.json
			// lists dist/, so the plugin flags every relative src/ import as
			// "unpublished". Project-level false positive for the TypeScript
			// src→dist build model — intentionally kept here rather than disabled
			// in the shared org config where the rule is genuinely useful.
			"n/no-unpublished-import": "off",
		},
	},
	{
		ignores: ["packages/*/dist/**", "packages/*/coverage/**", "packages/cli-utils/**", "**/node_modules/**"],
	},
] satisfies Linter.Config[];
