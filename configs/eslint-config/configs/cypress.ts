import cypress from "eslint-plugin-cypress";
import type { Linter } from "eslint";

export function cypressConfig(): Linter.FlatConfig[] {
	// `extends` is valid ESLint 9 flat config syntax but ConfigObject from
	// typescript-eslint doesn't declare it yet — cast to bypass contextual typing.
	const config = [
		{
			name: "@theholocron/cypress",
			files: ["cypress/**/*.{js,ts,jsx,tsx}"],
			extends: [cypress.configs.recommended],
		},
	];
	return config as unknown as Linter.FlatConfig[];
}

export { cypressConfig as cypress };
