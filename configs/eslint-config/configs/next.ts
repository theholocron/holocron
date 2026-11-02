import next from "@next/eslint-plugin-next";
import type { Linter } from "eslint";

/** ESLint rules for a Next.js app: the plugin's recommended and Core Web Vitals sets. */
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
