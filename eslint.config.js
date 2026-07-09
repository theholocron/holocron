// Workspace-level ESLint config (flat). Minimal but strict.
//
// Not using `@theholocron/eslint-config` directly yet — that package
// calls `includeIgnoreFile` on a path relative to its pnpm CAS location,
// which doesn't exist. Fixed in theholocron/configs#202 (pending merge).
// Swap back once that ships and the catalog is bumped.

import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default [
	{
		ignores: [
			"packages/*/dist/**",
			"packages/*/coverage/**",
			"packages/cli-utils/**", // v1 carryover — lints when we cherry-pick
			"**/node_modules/**",
		],
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		languageOptions: {
			ecmaVersion: 2024,
			sourceType: "module",
			globals: { ...globals.node },
		},
		rules: {
			"@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
		},
	},
];
