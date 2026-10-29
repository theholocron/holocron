export interface DevmojiEntry {
	code: string;
	emoji?: string;
	gitmoji?: string;
	description?: string;
}

export interface DevmojiConfig {
	types?: string[];
	devmoji?: DevmojiEntry[];
}

const defaultTypes: string[] = ["lint"];

const defaultDevmoji: DevmojiEntry[] = [
	{ code: "feat", emoji: "boom" },
	{
		code: "fail",
		emoji: "poop",
		description: "catastrophic failure or emergency hot fix — not for routine bug fixes",
	},
	{ code: "config", gitmoji: "wrench", emoji: "gear" },
];

/**
 * Returns a devmoji configuration merged with theholocron defaults.
 * Pass overrides to extend or replace specific entries for a given repo.
 *
 * ```js
 * // devmoji.config.cjs
 * const { defineConfig } = require('@theholocron/devmoji-config');
 * module.exports = defineConfig();
 *
 * // With repo-specific overrides:
 * module.exports = defineConfig({
 *   devmoji: [{ code: "feat", emoji: "sparkles" }],
 * });
 * ```
 */
export function defineConfig(overrides: Partial<DevmojiConfig> = {}): DevmojiConfig {
	return {
		types: [...defaultTypes, ...(overrides.types ?? [])],
		devmoji: [...defaultDevmoji, ...(overrides.devmoji ?? [])],
	};
}

/**
 * Ready-to-use config for repos that need no overrides — every org repo's
 * generated `devmoji.config.cjs` calls `defineConfig()` with no args (see
 * `holocron setup`'s template), so this covers all of them. `devmoji
 * --config <path>` loads a file's default export directly, same requirement
 * as `eslint --config` (config-resolution workstream, #676 in
 * theholocron/holocron) — lets the resolver point at this file with zero
 * committed local content.
 */
export default defineConfig();
