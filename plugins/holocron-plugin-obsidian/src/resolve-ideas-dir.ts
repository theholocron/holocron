import { join } from "node:path";

import { ConfigError } from "@theholocron/cli";
import { holocronEnv } from "@theholocron/env-utils/lookup";

/** Where Obsidian keeps every iCloud vault, relative to the home folder; a vault is a folder named for it inside. */
export const ICLOUD_VAULTS_ROOT = "Library/Mobile Documents/iCloud~md~obsidian/Documents";

/** The config path the `vault` option is reported under in a `ConfigError`. */
const VAULT_PATH = "providers.ideas.vault";

/** Throws a `ConfigError` unless `vault` is a non-empty string naming one folder (no `/`, no `\`, not `.` or `..`). */
function checkVault(vault: unknown): asserts vault is string {
	if (typeof vault !== "string" || vault.trim() === "") {
		throw new ConfigError(`${VAULT_PATH} must be a non-empty string`);
	}
	if (vault.includes("/") || vault.includes("\\") || vault === "." || vault === "..") {
		throw new ConfigError(`${VAULT_PATH} must be a single folder name, not a path (got "${vault}")`);
	}
}

/**
 * The folder of idea notes, most specific first: `HOLOCRON_IDEAS_DIR` (then `IDEAS_DIR`), else the provider's `dir`,
 * else the iCloud folder Obsidian keeps the `vault` in
 * (`<home>/Library/Mobile Documents/iCloud~md~obsidian/Documents/<vault>`). A leading `~` in the variable or `dir` is
 * the home folder. `undefined` when none names one. A `vault` that is not a single folder name is a `ConfigError`,
 * even when `dir` or the variable wins.
 */
export function resolveIdeasDir(
	dir: string | undefined,
	home: string,
	source?: Record<string, string | undefined>,
	vault?: string
): string | undefined {
	if (vault !== undefined) checkVault(vault);
	const chosen = holocronEnv(source).get("IDEAS_DIR") ?? dir;
	if (chosen === undefined) return vault === undefined ? undefined : join(home, ICLOUD_VAULTS_ROOT, vault);
	if (chosen === "~") return home;
	return chosen.startsWith("~/") ? join(home, chosen.slice(2)) : chosen;
}
