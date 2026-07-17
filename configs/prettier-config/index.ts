import type { Config } from "prettier";

/**
 * @see https://prettier.io/docs/en/configuration.html
 */
const config = {
	arrowParens: "always",
	bracketSameLine: false,
	bracketSpacing: true,
	experimentalTernaries: false,
	jsxSingleQuote: false,
	quoteProps: "as-needed",
	printWidth: 120,
	semi: true,
	singleQuote: false,
	tabWidth: 4,
	trailingComma: "es5",
	useTabs: true,
	overrides: [
		{
			files: ["*.json", "*.yml", "*.yaml"],
			options: {
				tabWidth: 2,
				useTabs: false,
			},
		},
		{
			// printWidth: 80 keeps tsconfig references arrays expanded one-per-line
			// (the collapsed form fits within 120 chars and becomes hard to scan).
			// String values never split regardless of printWidth, so this only
			// affects arrays of objects that exceed 80 chars — in practice just
			// the references array.
			files: ["tsconfig*.json"],
			options: {
				printWidth: 80,
			},
		},
	],
} satisfies Config;

export default config;
