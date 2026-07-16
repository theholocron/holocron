import { library } from "@theholocron/eslint-config/bundles/library";

/** @type {import("eslint").Linter.Config} */
const config = [
	...library(),
	{
		rules: {
			"n/no-unpublished-import": "off",
		},
	},
	{ ignores: ["dist/**", "coverage/**"] },
];

export default config;
