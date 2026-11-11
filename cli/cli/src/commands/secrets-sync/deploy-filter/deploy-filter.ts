import type { RepoSecretsDeploy } from "../../../config/index.js";
import type { DeployFilter } from "./deploy-filter.type.js";

/**
 * What `repo.secrets.deploy` lets one vault environment send to a deployment or a Worker: every entry naming it adds
 * its `keys` and `prefix`. `undefined` when no entry names it, which the caller turns into a `ConfigError`; there is
 * no default that sends everything.
 *
 * @param entries - `repo.secrets.deploy`, if the config has it.
 * @param environmentId - The vault environment being synced.
 */
export function deployFilter(
	entries: RepoSecretsDeploy[] | undefined,
	environmentId: string
): DeployFilter | undefined {
	const matching = (entries ?? []).filter((entry) => entry.environment === environmentId);
	if (matching.length === 0) return undefined;
	return {
		keys: [...new Set(matching.flatMap((entry) => entry.keys ?? []))],
		prefixes: [...new Set(matching.flatMap((entry) => (entry.prefix ? [entry.prefix] : [])))],
	};
}
