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
				// @eslint/json 2.x provides a JSON sourceCode object without
				// getAllComments(), causing this core rule to crash when linting
				// package.json files. JSON files have no comments to check anyway.
				"no-irregular-whitespace": "off",
				// eslint-plugin-n rules crash on JSON files: node-builtins checks
				// globalScope (absent in JSON context) and no-extraneous-require
				// tries to resolve tsconfig (irrelevant for JSON). Disabling here
				// is safe — these rules are meaningless for package.json files.
				"n/no-unsupported-features/node-builtins": "off",
				"n/no-extraneous-require": "off",
			},
		},
	];
}
