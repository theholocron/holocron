import { library } from "@theholocron/eslint-config/bundles/library";
import { vitest } from "@theholocron/eslint-config/vitest";

export default [
	...library(),
	...vitest(),
	{
		settings: { node: { version: ">=22.0.0" } },
		rules: {
			"n/no-unpublished-import": "off",
			// Workspace packages export from dist/ which isn't built in CI lint —
			// n/no-missing-import sees a broken export map. pnpm lint handles this.
			"n/no-missing-import": "off",
		},
	},
	{
		ignores: ["packages/*/dist/**", "packages/*/coverage/**", "packages/cli-utils/**", "**/node_modules/**"],
	},
];
