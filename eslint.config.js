import { fileURLToPath } from "node:url";
import { defineConfig, includeIgnoreFile } from "eslint/config";
import { holocron } from "@theholocron/eslint-config";

export default defineConfig([
	includeIgnoreFile(fileURLToPath(new URL(".gitignore", import.meta.url))),
	{
		// Workspace-specific ignores on top of .gitignore
		ignores: [
			"packages/*/dist/**",
			"packages/*/coverage/**",
			"packages/cli-utils/**", // v1 carryover — lints when we cherry-pick
		],
	},
	...holocron,
	{
		rules: {
			"@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
		},
	},
]);
