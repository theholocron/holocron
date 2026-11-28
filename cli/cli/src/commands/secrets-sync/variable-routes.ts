import type { RepoVariablesSync } from "../../config/index.js";
import { parseScope } from "./parse-scope/index.js";
import type { VariableRoute } from "./secrets-sync.type.js";

/**
 * The routes into Actions variables that `repo.variables.sync` declares for one vault environment: every entry naming
 * it gives its keys and the scope they land at (`repo` when omitted). An environment no entry names has none.
 *
 * @param entries - `repo.variables.sync`, if the config has it.
 * @param environmentId - The vault environment being synced.
 * @throws When an entry's `scope` is not `repo` or `org=<name>`.
 */
export function variableRoutes(entries: RepoVariablesSync[] | undefined, environmentId: string): VariableRoute[] {
	return (entries ?? [])
		.filter((entry) => entry.environment === environmentId)
		.map((entry) => {
			const scope = parseScope(entry.scope ?? "repo");
			if (scope.kind === "environment") {
				throw new Error(`invalid variable scope "${entry.scope}" — expected "repo" or "org=<name>"`);
			}
			return {
				scope,
				keys: entry.keys,
				...(entry.visibility ? { visibility: entry.visibility } : {}),
			};
		});
}
