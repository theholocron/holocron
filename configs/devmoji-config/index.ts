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
