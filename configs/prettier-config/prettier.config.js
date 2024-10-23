/**
 * @see https://prettier.io/docs/en/configuration.html
 * @type {import("prettier").Config}
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
	],
};

export default config;
