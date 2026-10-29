import { library } from "@theholocron/eslint-config/bundles/library";
import { vitest } from "@theholocron/eslint-config/vitest";
import type { Linter } from "eslint";

export default [
	...library(),
	...vitest(),
	{
		// eslint-plugin-n defaults to Node >=16 when engines.node is absent from
		// a package — override at workspace level to match our engines requirement.
		// TODO: move engines.node into each package.json instead (#111 follow-up).
		settings: { node: { version: ">=22.0.0" } },
	},
	{
		files: ["docs/src/**"],
		rules: {
			// docs/src imports live in root package.json, not docs/package.json
			"n/no-extraneous-import": "off",
		},
	},
	{
		// These utils use browser APIs (navigator, sessionStorage, KeyboardEvent), so the Node.js built-ins
		// rule does not apply to them.
		files: ["utils/location-utils/src/**", "utils/misc-utils/src/**", "utils/storage-utils/src/**"],
		rules: {
			"n/no-unsupported-features/node-builtins": "off",
		},
	},
	{
		files: ["skills/package.json"],
		rules: {
			// the CLI resolves the package root through require.resolve("@theholocron/skills/package.json"),
			// so the export must stay; npm always packs package.json, which no-redundant-files knows and this rule does not
			"package-json/prefer-files-field": "off",
		},
	},
	{
		ignores: [
			"cli/*/dist/**",
			"cli/*/coverage/**",
			"clients/*/dist/**",
			"clients/*/coverage/**",
			"utils/*/dist/**",
			"utils/*/coverage/**",
			"**/node_modules/**",
		],
	},
] satisfies Linter.Config[];
