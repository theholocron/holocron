import { declaredVsActual } from "@theholocron/kyber/ui";

import type { RepoVariablesSync } from "../../config/index.js";
import type { VariableScopeCheck } from "./doctor-secrets.type.js";

/** Re-keys what GitHub holds by the spelling the config declares, since GitHub treats names as case-insensitive. */
function bySpelling<T>(declared: string[], have: Record<string, T>): Map<string, T> {
	const spelled = new Map(declared.map((name) => [name.toUpperCase(), name]));
	return new Map(Object.entries(have).map(([name, value]) => [spelled.get(name.toUpperCase()) ?? name, value]));
}

/**
 * The checks `repo.variables.sync` adds to `holocron doctor secrets`: one per entry, that every key it lists exists
 * at its scope. The values live in the vault, which the doctor does not read, so only names (and, for an organization
 * entry, the visibility it writes) are compared and a value is never shown. A scope that is not `repo` or `org=<name>`
 * is rejected when the config loads, so it is not handled here.
 *
 * @param entries - `repo.variables.sync`, if the config has it.
 */
export function syncVariableChecks(entries: RepoVariablesSync[] | undefined): VariableScopeCheck[] {
	return (entries ?? []).map((entry) => {
		const scope = entry.scope ?? "repo";
		const org = scope.startsWith("org=") ? scope.slice("org=".length) : undefined;
		return {
			id: `sync-${entry.environment}-${scope}`,
			scope: org === undefined ? "repo" : "org",
			title: `${org === undefined ? "repository" : `${org} organization`} variables from ${entry.environment} exist`,
			async run(source) {
				const checked = entry.keys.length;
				if (org === undefined) {
					if (!source.listVariables) return { skip: "provider does not implement listVariables" };
					const have = bySpelling(entry.keys, await source.listVariables());
					const problems = declaredVsActual(
						new Map(entry.keys.map((name) => [name, true])),
						new Map([...have.keys()].map((name) => [name, true])),
						{ noun: "variable", flagExtra: false }
					);
					return { problems, checked, have: [...have.keys()] };
				}
				if (!source.listOrgVariables) return { skip: "provider does not implement listOrgVariables" };
				const have = bySpelling(entry.keys, await source.listOrgVariables(org));
				const problems = declaredVsActual(
					new Map(entry.keys.map((name) => [name, entry.visibility ?? "all"])),
					new Map([...have].map(([name, v]) => [name, v.visibility])),
					{
						noun: "organization variable",
						flagExtra: false,
						show: (visibility) => `visibility ${visibility}`,
					}
				);
				return { problems, checked, have: [...have.keys()] };
			},
		};
	});
}
