import tseslint from "typescript-eslint";

export function typescript() {
	return [
		...tseslint.configs.recommended,
		{
			name: "@theholocron/typescript",
			rules: {
				"@typescript-eslint/no-unused-vars": [
					"error",
					{
						argsIgnorePattern: "^_",
						varsIgnorePattern: "^_",
					},
				],
			},
		}
	];
}
