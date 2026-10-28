/**
 * `holocron.config.{ts,js,mjs,cjs,json}` loader.
 *
 * File discovery + module loading (typed configs via `tsx`, no build
 * step) is delegated to `@theholocron/datapad`. This module keeps the
 * holocron-specific parts: filling `name` / `repo.name` defaults and
 * running the config through `resolveConfig`.
 *
 * Probe order is TS-first (`.ts` → `.js` → `.mjs` → `.cjs` → `.json`) —
 * see ADR-0010 / issue #75 / #81.
 */

import { basename, dirname } from "node:path";

import { loadTasksConfig } from "@theholocron/astromech/config";
import { ConfigFileError, loadConfigFile, type Loaded } from "@theholocron/datapad";
import { readGitRemote } from "@theholocron/git-utils";
import { readPackageJson } from "@theholocron/pkg-utils";

import { type HolocronConfig, resolveConfig } from "../config/index.js";
import type { LoadedConfig } from "./load-config.type.js";

export { ConfigFileError } from "@theholocron/datapad";

/**
 * Read + parse + resolve `holocron.config.*` starting from the given
 * directory, walking up through ancestors to the nearest `.git` boundary
 * when `cwd` itself has no match — every command is usable from any
 * subdirectory of a repo, not only its exact root (see
 * `@theholocron/datapad`'s own doc comment for the stop conditions).
 * Throws {@link ConfigFileError} when nothing is found or a file cannot
 * be loaded, or `ConfigError` when the config fails schema checks.
 */
export async function loadConfig(cwd: string): Promise<LoadedConfig> {
	const found = await loadConfigFile<HolocronConfig>({ cwd, name: "holocron", walkUp: true });
	if (!found) {
		throw new ConfigFileError(
			`no holocron.config.{ts,js,mjs,cjs,json} found in ${cwd}. Create one — see the README for the schema.`
		);
	}
	const withDefaults = await deriveDefaults(found);
	return { resolved: resolveConfig(withDefaults), filepath: found.filepath };
}

async function deriveDefaults(found: Loaded<HolocronConfig>): Promise<HolocronConfig> {
	const configDir = dirname(found.filepath);
	const result = { ...found.config };
	if (!result.name) {
		result.name = (await readPackageJsonName(configDir)) ?? basename(configDir);
	}
	if (result.repo && !result.repo.name) {
		const remote = await readGitRemote(configDir);
		// `repo.name` holds GitHub coordinates (owner/repo); a remote on any other host leaves it unset.
		if (remote?.host === "github.com") result.repo = { ...result.repo, name: remote.slug };
	}

	// Layer in the task manifest. `holocron.config`'s `tasks` key is one input;
	// a dedicated `astromech.config.{ts,js,mjs,json}` is merged on top (it wins
	// on scalars, task arrays concatenate). Doing it here keeps `holocron repo setup`
	// / `sync` / `doctor` on the same manifest that `holocron run` / `holocron
	// ci` resolve directly via `loadTasksConfig` — handed the file already loaded
	// above so it isn't found and loaded a second time.
	const manifest = await loadTasksConfig(configDir, { holocron: found });
	if (manifest.tasks) result.tasks = manifest.tasks;
	if (manifest.syncScripts !== undefined) result.syncScripts = manifest.syncScripts;
	if (manifest.holocronScript !== undefined) result.holocronScript = manifest.holocronScript;
	if (manifest.hooks !== undefined) result.hooks = manifest.hooks;
	if (manifest.extraRequiredChecks) {
		result.extraRequiredChecks = [...(result.extraRequiredChecks ?? []), ...manifest.extraRequiredChecks];
	}

	return result;
}

async function readPackageJsonName(dir: string): Promise<string | undefined> {
	const name = (await readPackageJson(dir))?.name;
	return name === undefined ? undefined : name.replace(/^@[^/]+\//, "");
}
