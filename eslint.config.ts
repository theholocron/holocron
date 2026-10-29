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
		// The shareable config packages configure tools their consumers install, so those peers are optional and not
		// installed for the package's own tests, and the `./package.json` export (npm always packs the file) is kept.
		files: ["configs/*/package.json"],
		rules: {
			"package-json/peer-dependencies-as-dev-dependencies": "off",
			"package-json/prefer-files-field": "off",
		},
	},
	{
		// CommonJS-only packages: moving them to ESM or an `exports` map would break the tools that `require()` them.
		files: ["configs/browserslist-config/package.json", "configs/tsconfig/package.json"],
		rules: {
			"package-json/prefer-exports": "off",
			"package-json/prefer-type-module": "off",
		},
	},
	{
		// CommonJS entry point of a CommonJS package: browserslist loads it with require().
		files: ["configs/browserslist-config/index.js"],
		languageOptions: { sourceType: "commonjs", globals: { module: "writable", require: "readonly" } },
		rules: { "@typescript-eslint/no-require-imports": "off" },
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
			"configs/*/dist/**",
			"configs/*/coverage/**",
			"themes/*/dist/**",
			"themes/*/coverage/**",
			"**/node_modules/**",
		],
	},
] satisfies Linter.Config[];
