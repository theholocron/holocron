import type { Linter } from "eslint";
import tseslint from "typescript-eslint";

/** ESLint flat config for TypeScript: the `typescript-eslint` recommended rules, with `no-unused-vars` ignoring names that start with an underscore. */
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
