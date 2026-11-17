import type { Linter } from "eslint";
import tseslint from "typescript-eslint";

/** The files the type-aware rules read: TypeScript source, which a package's `tsconfig.json` includes. */
const TYPED_FILES = ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"];

/**
 * Files linted without type information. Tool config files at a package's root (`eslint.config.ts`,
 * `tsdown.config.ts`, `holocron.config.ts`, `vitest.config.ts` and the vitest setup files), the `.holocron/` area files,
 * declaration files and example scripts are not in a package's `tsconfig.json`, so the project service cannot type them.
 * Tests are left out on purpose: many packages exclude them from their `tsconfig.json` (so they would fail to parse),
 * and what the type-aware rules flag in a test is almost all noise: a mock's `unbound-method`, an `unknown` JSON value
 * assigned in a fixture, an `async` stub that has nothing to await.
 */
const UNTYPED_FILES = [
	"**/*.config.{ts,mts,cts}",
	"**/vitest.*.ts",
	"**/.holocron/**/*.ts",
	"**/*.d.ts",
	"**/examples.ts",
	"**/*.{test,spec}.{ts,tsx,mts,cts}",
	"**/*.testing.ts",
];

/**
 * ESLint flat config for TypeScript: the type-aware `typescript-eslint` recommended rules (`recommendedTypeChecked`,
 * through the project service, which finds each package's own `tsconfig.json`), with `no-unused-vars` ignoring names
 * that start with an underscore. Type information is read for TypeScript files only; JavaScript, JSON and the tool
 * config files are linted without it.
 */
export function typescript(): Linter.Config[] {
	return [
		// Every file keeps the rules that need no type information, as before; TypeScript files then get the type-aware ones.
		...tseslint.configs.recommended,
		...tseslint.configs.recommendedTypeChecked.map((config) => ({ ...config, files: TYPED_FILES })),
		{
			name: "@theholocron/typescript",
			files: TYPED_FILES,
			languageOptions: { parserOptions: { projectService: true } },
			rules: {
				// An `async` function with nothing to await is how a method satisfies an interface that returns a Promise
				// (every capability method, every stub); the rule flags those on purpose.
				"@typescript-eslint/require-await": "off",
				// Destructuring a function out of a factory's result (`const { workflowHeader } = createHeader(...)`) is
				// how this code shares helpers; those functions never use `this`, and the rule flags every one.
				"@typescript-eslint/unbound-method": "off",
				// `String(value)` on an `unknown` is how this code prints a value it has just checked is not undefined (an
				// error's `details`, a CLI flag, a JSON field); the rule flags each of those and can't be told they are meant.
				"@typescript-eslint/no-base-to-string": "off",
				// `"a" | "b" | string` (and `string & {}`) keeps editor completion for a field that takes any string.
				"@typescript-eslint/no-redundant-type-constituents": "off",
				"@typescript-eslint/no-unused-vars": [
					"error",
					{
						argsIgnorePattern: "^_",
						varsIgnorePattern: "^_",
					},
				],
			},
		},
		{
			...tseslint.configs.disableTypeChecked,
			name: "@theholocron/typescript/untyped",
			files: UNTYPED_FILES,
		},
	];
}
