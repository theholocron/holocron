import n from "eslint-plugin-n";
import type { Linter } from "eslint";

export function node(): Linter.FlatConfig[] {
	return [
		n.configs["flat/recommended-module"],
		{
			name: "@theholocron/node",
			rules: {
				"n/no-process-exit": "off",
				"n/no-missing-import": "off", // TS handles this better
				"n/no-unsupported-features/es-syntax": "off",
			},
		},
	];
}
