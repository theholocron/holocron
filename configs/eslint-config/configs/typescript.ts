import type { Linter } from "eslint";
import tseslint from "typescript-eslint";

export function typescript(): Linter.Config[] {
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
		},
	];
}
