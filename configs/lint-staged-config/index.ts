import { existsSync } from "node:fs";

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
 * invocation. Resolved relative to the consuming repo's root, since
 * `lint-staged` — like every git hook — always runs from there regardless
 * of which subdirectory a staged file lives in.
 */
function resolveConfig(relativePath: string): string | null {
	return existsSync(relativePath) ? relativePath : null;
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
