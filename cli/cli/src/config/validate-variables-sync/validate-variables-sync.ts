import { ConfigError } from "@theholocron/kyber/config";

import type { RepoVariables } from "../config/index.js";
import { validateEnvironmentChoice } from "../validate-environment-choice/index.js";

/** GitHub treats variable names as case-insensitive, so every comparison goes through this. */
const key = (name: string): string => name.toUpperCase();

/**
 * Check `repo.variables.sync`: each entry names a vault environment, one or more keys and a scope that is `repo` or
 * `org=<name>`; a name may not also be a literal value of the same scope (one source per name); and `prune` cannot
 * be combined with `sync`, because `repo setup` would delete the variables the sync wrote.
 *
 * @param variables - `repo.variables`, if the config has it.
 * @throws {ConfigError} Naming the first problem found.
 */
export function validateVariablesSync(variables: RepoVariables | undefined): void {
	const entries = variables?.sync;
	if (!entries || entries.length === 0) return;
	if (variables?.prune === true) {
		throw new ConfigError(
			"`repo.variables.prune` cannot be combined with `repo.variables.sync`: pruning would delete the variables the sync writes"
		);
	}
	for (const entry of entries) {
		const named = validateEnvironmentChoice(entry, "a `repo.variables.sync` entry");
		const label = `\`repo.variables.sync\` entry for ${JSON.stringify(named)}`;
		if (
			!Array.isArray(entry.keys) ||
			entry.keys.length === 0 ||
			entry.keys.some((k) => typeof k !== "string" || k === "")
		) {
			throw new ConfigError(`${label} needs \`keys\`, a list of variable names`);
		}
		const scope = entry.scope ?? "repo";
		const org = scope.startsWith("org=") ? scope.slice("org=".length) : undefined;
		if (scope !== "repo" && (org === undefined || org === "")) {
			throw new ConfigError(`${label} has scope ${JSON.stringify(scope)}: use "repo" or "org=<name>"`);
		}
		if (entry.visibility !== undefined && entry.visibility !== "all" && entry.visibility !== "private") {
			throw new ConfigError(
				`${label} has visibility ${JSON.stringify(entry.visibility)}: use "all" or "private"`
			);
		}
		const literal = new Set(Object.keys((org === undefined ? variables?.repo : variables?.org) ?? {}).map(key));
		const both = entry.keys.filter((k) => literal.has(key(k)));
		if (both.length > 0) {
			throw new ConfigError(
				`${label} lists ${both.join(", ")}, which \`repo.variables.${org === undefined ? "repo" : "org"}\` also gives a value: keep one source per name`
			);
		}
	}
}
