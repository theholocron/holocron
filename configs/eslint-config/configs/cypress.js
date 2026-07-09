import cypress from "eslint-plugin-cypress";

export function cypressConfig() {
	return [
		{
			name: "@theholocron/cypress",
			files: ["cypress/**/*.{js,ts,jsx,tsx}"],
			extends: [
				cypress.configs.recommended,
			],
		},
	];
}

export { cypressConfig as cypress };
