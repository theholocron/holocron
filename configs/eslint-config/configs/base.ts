import js from "@eslint/js";
import type { Linter } from "eslint";
import globals from "globals";
import simpleImportSort from "eslint-plugin-simple-import-sort";

export function base(): Linter.Config[] {
	return [
		{
			name: "@theholocron/base",
			languageOptions: {
				globals: {
					...globals.browser,
					...globals.node,
				},
			},
		},
		js.configs.recommended,
		{
			name: "@theholocron/imports",
			plugins: {
				"simple-import-sort": simpleImportSort,
			},
			rules: {
				"simple-import-sort/imports": "error",
				"simple-import-sort/exports": "error",
			},
		},
	];
}
