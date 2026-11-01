import type { Config } from "prettier";

/**
 * @see https://prettier.io/docs/en/configuration.html
 */
const config = {
	/** Prettier's `arrowParens`: always wrap arrow function parameters in parentheses. */
	arrowParens: "always",
	/** Prettier's `bracketSameLine`: off, so the closing `>` of a multi-line JSX element goes on its own line. */
	bracketSameLine: false,
	/** Prettier's `bracketSpacing`: print spaces inside object braces. */
	bracketSpacing: true,
	/** Prettier's `experimentalTernaries`: off, so the standard ternary formatting is used. */
	experimentalTernaries: false,
	/** Prettier's `jsxSingleQuote`: off, so JSX attributes use double quotes. */
	jsxSingleQuote: false,
	/** Prettier's `quoteProps`: quote object properties only where required. */
	quoteProps: "as-needed",
	/** Prettier's `printWidth`: lines wrap at 120 columns. */
	printWidth: 120,
	/** Prettier's `semi`: statements end with a semicolon. */
	semi: true,
	/** Prettier's `singleQuote`: off, so strings use double quotes. */
	singleQuote: false,
	/** Prettier's `tabWidth`: a tab counts as 4 columns. */
	tabWidth: 4,
	/** Prettier's `trailingComma`: `es5`, so trailing commas go where ES5 allows them (objects and arrays, not function parameters). */
	trailingComma: "es5",
	/** Prettier's `useTabs`: indent with tabs. */
	useTabs: true,
	/** Per-file overrides: two-space indentation for Markdown, MDX, JSON and YAML, and an 80-column width for `tsconfig*.json`. */
	overrides: [
		{
			files: ["*.md", "*.mdx"],
			options: {
				tabWidth: 2,
				useTabs: false,
			},
		},
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
