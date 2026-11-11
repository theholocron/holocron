import type { RepoSecretsSync } from "../../config/index.js";
import { parseScope } from "./parse-scope/index.js";
import { repoName } from "./repo-name/index.js";
import type { SecretRoute } from "./secrets-sync.type.js";

/**
 * The routes into `secrets` that `repo.secrets.sync` declares for one vault environment: every entry naming it gives
 * its keys (all of them when omitted) and the scope they land at (`repo` when omitted). An environment no entry names
 * has no routes, which leaves `secrets sync` to its own flags. An organization scope also carries
 * `visibility: "selected"` and its `repos`, as names in the organization (spec `tech-org-secret-visibility`, #2062).
 *
 * @param entries - `repo.secrets.sync`, if the config has it.
 * @param environmentId - The vault environment being synced.
 * @throws When an entry's `scope` is not `repo`, `env=<name>` or `org=<name>`.
 */
export function secretRoutes(entries: RepoSecretsSync[] | undefined, environmentId: string): SecretRoute[] {
	return (entries ?? [])
		.filter((entry) => entry.environment === environmentId)
		.map((entry) => {
			const scope = parseScope(entry.scope ?? "repo");
			return {
				scope:
					scope.kind === "organization" && entry.repos
						? { ...scope, visibility: "selected" as const, repos: entry.repos.map(repoName) }
						: scope,
				...(entry.keys ? { keys: entry.keys } : {}),
			};
		});
}
