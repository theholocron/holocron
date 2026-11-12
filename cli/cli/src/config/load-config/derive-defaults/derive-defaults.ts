import { basename, dirname } from "node:path";

import { loadTasksConfig } from "@theholocron/astromech/config";
import type { Loaded } from "@theholocron/datapad";
import { readGitRemote } from "@theholocron/git-utils";

import type { HolocronConfig } from "../../config/index.js";
import { readPackageJsonName } from "../read-package-json-name/index.js";

/**
 * Fill in what a `holocron.config` leaves out: `name` from the package or directory, `repo.name` from the GitHub
 * remote, and the task manifest (merged from `astromech.config.*`).
 */
export async function deriveDefaults(found: Loaded<HolocronConfig>): Promise<HolocronConfig> {
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
	// on scalars, task arrays concatenate). Doing it here keeps `holocron setup`
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
