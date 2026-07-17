import next from "@next/eslint-plugin-next";
import type { Linter } from "eslint";

export function nextConfig(): Linter.FlatConfig[] {
	return [
		{
			name: "@theholocron/next",
			plugins: {
				"@next/next": next,
			},
			rules: {
				...next.configs.recommended.rules,
				...next.configs["core-web-vitals"].rules,
			},
		},
	];
}

export { nextConfig as next };
