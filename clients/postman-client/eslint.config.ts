import { library } from "@theholocron/eslint-config/bundles/library";
import type { Linter } from "eslint";

const config = [
	...library(),
	{
		rules: {
			"n/no-unpublished-import": "off",
		},
	},
	{ ignores: ["dist/**", "coverage/**"] },
] satisfies Linter.Config[];

export default config;
