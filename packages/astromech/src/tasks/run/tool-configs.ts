import type { ToolConfigSpec } from "./tool-configs.type.js";

/**
 * `library` is every mapped tool's org-wide default variant today — every
 * currently-migrated repo (`holocron`, `clients`, `utils`, `configs`,
 * `themes`, `observability`, `skills`) is a publishable library package, and
 * `eslint-config`/`vitest-config`/`tsdown-config` all name their
 * general-purpose preset exactly that. Picking a different variant per repo
 * (an app-type template, say) needs new `holocron.config.ts` surface this
 * doesn't add yet — deliberately out of scope until a real consumer needs it.
 */
export const TOOL_CONFIGS: Readonly<Record<string, ToolConfigSpec>> = {
	eslint: { package: "@theholocron/eslint-config", exportPath: "./bundles/library", flag: ["--config"] },
	prettier: { package: "@theholocron/prettier-config", exportPath: ".", flag: ["--config"] },
	vitest: { package: "@theholocron/vitest-config", exportPath: "./bundles/library", flag: ["--config"] },
	tsdown: { package: "@theholocron/tsdown-config", exportPath: "./presets/library", flag: ["--config"] },
	commitlint: { package: "@theholocron/commitlint-config", exportPath: ".", flag: ["--config"] },
};

/**
 * Every filename a tool's own auto-discovery would pick up from `cwd` —
 * same extension set `registry.ts`'s `turbo.inputs`/`local.detect` entries
 * already use for these tools, kept in sync by hand (no shared source of
 * truth between the two today). Presence of any one of these means the
 * package has its own local config — customized or not, `resolveToolConfig`
 * can't tell the difference from the filename alone, so it defers to it
 * either way (#749).
 */
export const LOCAL_CONFIG_FILES: Readonly<Record<string, readonly string[]>> = {
	eslint: ["eslint.config.ts", "eslint.config.js", "eslint.config.mjs", "eslint.config.cjs"],
	prettier: ["prettier.config.ts", "prettier.config.js", "prettier.config.mjs", "prettier.config.cjs"],
	vitest: ["vitest.config.ts", "vitest.config.js", "vitest.config.mjs"],
	tsdown: ["tsdown.config.ts", "tsdown.config.js", "tsdown.config.mjs", "tsdown.config.cjs"],
	commitlint: ["commitlint.config.ts", "commitlint.config.js", "commitlint.config.mjs", "commitlint.config.cjs"],
};
