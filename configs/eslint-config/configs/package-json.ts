import type { Linter } from "eslint";
import eslintPackageJson from "eslint-package-json";

export function packageJson(): Linter.Config[] {
	return [
		{
			name: "@theholocron/package-json",
			...eslintPackageJson.configs.recommended,
			rules: {
				...eslintPackageJson.configs.recommended.rules,
				// pnpm catalog: specifiers (e.g. "catalog:configs") are not standard
				// semver ranges — this rule would flag every theholocron catalog entry.
				"package-json/dependency-version-range": "off",
				// workspace:* is intentional in peerDependencies for monorepo-internal
				// packages; turning off avoids false positives on pnpm workspace refs.
				"package-json/no-wildcard-dependencies": "off",
			},
		},
	];
}
