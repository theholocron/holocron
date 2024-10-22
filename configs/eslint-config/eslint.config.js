import path from "node:path";
import { fileURLToPath } from "node:url";
import { includeIgnoreFile } from "@eslint/compat";
import pluginJs from "@eslint/js";
import pluginReact from "eslint-plugin-react";
import globals from "globals";
import tseslint from "typescript-eslint";

// Get the current file path and directory (node_modules/foo/)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Navigate to the root directory (two levels up from node_modules/foo/)
const rootDir = path.resolve(__dirname, "../../../");

// Resolve the .gitignore file from the root directory
const gitignorePath = path.resolve(rootDir, ".gitignore");

/**
 * @see https://eslint.org/docs/latest/use/configure/
 * @type {import("eslint").Linter.Config}
 */
export default [
	includeIgnoreFile(gitignorePath),
	{
		name: "The Holocron",
		files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"],
		ignores: ["**/mockServiceWorker.js"],
	},
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node,
			},
		},
	},
	pluginJs.configs.recommended,
	...tseslint.configs.recommended,
	pluginReact.configs.flat.recommended,
	pluginReact.configs.flat["jsx-runtime"],
];
