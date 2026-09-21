import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * `<tool> --write`/`<tool>` alone falls back to the tool's own auto-discovery
 * of a local config file — unchanged from today, safe when a consuming repo
 * hasn't adopted the shared `@theholocron/*-config` packages (or predates
 * this fix). When the shared package *is* installed, point `--config`
 * straight at its built entry point instead of relying on a local
 * `prettier.config.ts`/`eslint.config.ts` that may no longer exist (epic
 * #672 Phase 5, theholocron/holocron#680) — same requirement astromech's
 * `resolveToolConfig()` already established for `holocron run <task>`
 * (theholocron/holocron#676/#749) and `.husky/commit-msg`'s commitlint
 * invocation.
 *
 * Resolved to an ABSOLUTE path, not left relative — lint-staged spawns each
 * command in a context where a relative path silently fails to resolve
 * (confirmed: `--config node_modules/@theholocron/prettier-config/dist/index.js`
 * resolved correctly under a plain manual shell invocation from the repo
 * root, but silently missed under lint-staged itself, falling back to
 * prettier's built-in printWidth 80 instead of the shared config's 120 —
 * found via theholocron/clients#348, where a lint-staged-driven commit
 * produced different line-wrapping than the identical command run by hand).
 * An absolute path removes any dependency on the spawned process's cwd.
 */
function resolveConfig(relativePath: string): string | null {
	const absolute = resolve(process.cwd(), relativePath);
	return existsSync(absolute) ? absolute : null;
}

const prettierConfig = resolveConfig("node_modules/@theholocron/prettier-config/dist/index.js");
const eslintConfig = resolveConfig("node_modules/@theholocron/eslint-config/dist/bundles/library.js");

const prettierWrite = prettierConfig ? `prettier --config ${prettierConfig} --write` : "prettier --write";
const eslint = eslintConfig ? `eslint --config ${eslintConfig}` : "eslint";

/**
 * @see https://github.com/lint-staged/lint-staged?tab=readme-ov-file#configuration
 */
const config = {
	"*.css": "stylelint --fix",
	"*.{js,jsx}": [prettierWrite, eslint],
	"*.md": [prettierWrite],
	"*.mdx": [prettierWrite],
	"*.scss": "stylelint --syntax=scss --fix",
	"*.{ts,tsx}": [prettierWrite, eslint],
	"package.json": "sort-package-json",
};

export default config;
