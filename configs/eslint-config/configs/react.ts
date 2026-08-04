import { fixupConfigRules } from "@eslint/compat";
import react from "eslint-plugin-react";

export function reactConfig() {
	return fixupConfigRules([react.configs.flat.recommended, react.configs.flat["jsx-runtime"]]);
}

export { reactConfig as react };
