// Workspace-level ESLint config (flat). Minimal but strict.
//
// Not using `@theholocron/eslint-config@4.1.0` directly yet — that
// package calls `includeIgnoreFile` on a `.gitignore` it doesn't ship
// in the npm tarball, so consuming it programmatically fails (see
// https://github.com/theholocron/eslint-config — upstream bug). The
// v1 repo only ran lint via super-linter in Docker, so the issue
// never surfaced. Swap back once the org config is fixed.

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
