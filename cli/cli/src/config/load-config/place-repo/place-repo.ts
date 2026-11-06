import type { ConfigDirArea } from "@theholocron/datapad";
import { ConfigError } from "@theholocron/kyber/config";

import type { HolocronConfig, RepoConfig } from "../../config/index.js";

/**
 * Add the keys of `.holocron/repo.*` to `repo`. The keys of the two sources must differ (`repo.defaultBranch` stays
 * inline so Sentinel can find the branch to read): a key set both inline and in the file is a `ConfigError` naming
 * both.
 */
export function placeRepo(raw: HolocronConfig, area: ConfigDirArea): HolocronConfig {
	if (typeof area.value !== "object" || area.value === null || Array.isArray(area.value)) {
		throw new ConfigError(`${area.path} must export the repo settings as an object`);
	}
	const fromFile = area.value as RepoConfig;
	const inline = raw.repo ?? {};
	for (const key of Object.keys(fromFile)) {
		if ((inline as Record<string, unknown>)[key] !== undefined) {
			throw new ConfigError(
				`repo.${key} is set in the config and in ${area.path}. Set it in one place: remove the inline value or the key from ${area.path}`
			);
		}
	}
	return { ...raw, repo: { ...inline, ...fromFile } };
}
