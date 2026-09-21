import { existsSync } from "node:fs";
import { dirname, join, parse } from "node:path";

import { includeIgnoreFile } from "@eslint/compat";
import js from "@eslint/js";
import type { Linter } from "eslint";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import globals from "globals";

/**
 * Ignore whatever the consuming repo's own .gitignore already ignores
 * (dist/, coverage/, node_modules/, …) instead of every repo hand-maintaining
 * its own `ignores:` array in eslint.config.ts. Walks up from process.cwd()
 * to find it, rather than checking cwd alone — a monorepo package almost
 * never has its own .gitignore (the root one covers the whole tree), and
 * astromech's resolver (config-resolution workstream, #676 in
 * theholocron/holocron) invokes `eslint --config <shared path>` with cwd set
 * to the PACKAGE directory for per-package fan-out, not the repo root. A
 * cwd-only check silently found nothing there and produced no ignores at
 * all — dist/coverage build output got linted for real, discovered when
 * theholocron/clients#348 hit real simple-import-sort errors in generated
 * .d.mts files. Stops at the first .git directory found (the actual repo
 * root) or the filesystem root, whichever comes first — never walks past
 * the repo. A repo without a .gitignore anywhere in that walk (unusual, but
 * not invalid) just gets no extra ignores from this — never throws.
 */
function findGitignore(startDir: string): string | undefined {
	let dir = startDir;
	for (;;) {
		const candidate = join(dir, ".gitignore");
		if (existsSync(candidate)) return candidate;
		if (existsSync(join(dir, ".git"))) return undefined;
		const parent = dirname(dir);
		if (parent === dir || dir === parse(dir).root) return undefined;
		dir = parent;
	}
}

function gitignoreConfig(): Linter.Config | undefined {
	const gitignorePath = findGitignore(process.cwd());
	if (!gitignorePath) return undefined;
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
