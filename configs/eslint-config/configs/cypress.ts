import cypress from "eslint-plugin-cypress";
import type { Linter } from "eslint";

export function cypressConfig(): Linter.FlatConfig[] {
	return [
		{
			name: "@theholocron/cypress",
			files: ["cypress/**/*.{js,ts,jsx,tsx}"],
			extends: [cypress.configs.recommended],
		},
	];
}

export { cypressConfig as cypress };
