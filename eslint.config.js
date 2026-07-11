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
			// TODO: both rules below move to @theholocron/eslint-config library bundle
			// once that ships. Remove these overrides after bumping the catalog.

			// Relative imports in TypeScript packages compile to dist/ via tsdown.
			// The plugin flags src/ files as "unpublished" because `files` lists dist/.
			"n/no-unpublished-import": "off",

			// validate scripts run as CLI scripts but aren't bin entries — the
			// shebang is intentional and the n/hashbang rule is wrong here.
			"n/hashbang": "off",
		},
	},
	{
		ignores: [
			"packages/*/dist/**",
			"packages/*/coverage/**",
			"packages/cli-utils/**",
			"**/node_modules/**",
		],
	},
];
