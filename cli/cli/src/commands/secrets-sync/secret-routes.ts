import type { RepoSecretsSync } from "../../config/index.js";
import { parseScope } from "./parse-scope/index.js";
import type { SecretRoute } from "./secrets-sync.type.js";

/**
 * The routes into `secrets` that `repo.secrets.sync` declares for one vault environment: every entry naming it gives
 * its keys (all of them when omitted) and the scope they land at (`repo` when omitted). An environment no entry names
 * has no routes, which leaves `secrets sync` to its own flags.
 *
 * @param entries - `repo.secrets.sync`, if the config has it.
 * @param environmentId - The vault environment being synced.
 * @throws When an entry's `scope` is not `repo`, `env=<name>` or `org=<name>`.
 */
export function secretRoutes(entries: RepoSecretsSync[] | undefined, environmentId: string): SecretRoute[] {
	return (entries ?? [])
		.filter((entry) => entry.environment === environmentId)
		.map((entry) => ({ scope: parseScope(entry.scope ?? "repo"), ...(entry.keys ? { keys: entry.keys } : {}) }));
}
