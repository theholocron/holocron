import type { Linter } from "eslint";
import { library } from "@theholocron/eslint-config/bundles/library";

const config = [
	...library(),
	{
		rules: {
			// src/ compiles to dist/ via tsdown; files[] lists dist/ so every
			// relative src/ import is flagged as unpublished. False positive
			// for the TypeScript src→dist build model.
			"n/no-unpublished-import": "off",
		},
	},
	{ ignores: ["dist/**", "coverage/**"] },
] satisfies Linter.Config[];

export default config;
