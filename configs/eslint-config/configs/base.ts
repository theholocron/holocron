import js from "@eslint/js";
import globals from "globals";

export function base() {
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
	];
}
