import { fixupConfigRules } from "@eslint/compat";
import type { Linter } from "eslint";
import react from "eslint-plugin-react";

export function reactConfig(): Linter.FlatConfig[] {
	return fixupConfigRules([react.configs.flat.recommended, react.configs.flat["jsx-runtime"]]).map((config) => ({
		...config,
		files: ["**/*.{js,jsx,ts,tsx,mjs,cjs}"],
	}));
}

export { reactConfig as react };
