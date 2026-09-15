import { existsSync } from "node:fs";
import { join } from "node:path";

import { includeIgnoreFile } from "@eslint/compat";
import js from "@eslint/js";
import type { Linter } from "eslint";
import globals from "globals";
import simpleImportSort from "eslint-plugin-simple-import-sort";

/**
 * Ignore whatever the consuming repo's own .gitignore already ignores
 * (dist/, coverage/, node_modules/, …) instead of every repo hand-maintaining
 * its own `ignores:` array in eslint.config.ts. Resolved against
 * process.cwd() — the repo root ESLint is actually invoked from, whether
 * that's a committed eslint.config.ts re-exporting this bundle or a future
 * `eslint --config <shared path>` invocation with no local file at all
 * (config-resolution workstream, #676 in theholocron/holocron). A repo
 * without a .gitignore (unusual, but not invalid) just gets no extra
 * ignores from this — never throws.
 */
function gitignoreConfig(): Linter.Config | undefined {
	const gitignorePath = join(process.cwd(), ".gitignore");
	if (!existsSync(gitignorePath)) return undefined;
	return includeIgnoreFile(gitignorePath, "@theholocron/gitignore");
}

/**
 * docs/src imports resolve against the repo ROOT package.json (docs sites
 * in this org are never their own workspace package — see clients/themes/
 * utils/observability), so n/no-extraneous-import flags every import in
 * that directory as a false positive. Scoped to a glob that simply matches
 * nothing in a repo without a docs/src — safe to always include rather
 * than opt into per repo.
 */
const docsSrcConfig: Linter.Config = {
	name: "@theholocron/docs-src",
	files: ["docs/src/**"],
	rules: {
		"n/no-extraneous-import": "off",
	},
};

export function base(): Linter.Config[] {
	const gitignore = gitignoreConfig();
	return [
		...(gitignore ? [gitignore] : []),
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
		{
			name: "@theholocron/imports",
			plugins: {
				"simple-import-sort": simpleImportSort,
			},
			rules: {
				"simple-import-sort/imports": "error",
				"simple-import-sort/exports": "error",
			},
		},
		docsSrcConfig,
	];
}
