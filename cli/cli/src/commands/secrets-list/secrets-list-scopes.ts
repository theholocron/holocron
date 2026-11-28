import type { SecretScope } from "../../plugin/index.js";
import type { ListScopesInput } from "./secrets-list.type.js";

/**
 * Turns `--scope`, `--env` and the resolved organization into the scopes to list.
 * With no `--scope` it lists the repository, then the organization and the
 * environment when one was named. Naming a scope whose name is missing throws.
 */
export function secretsListScopes(input: ListScopesInput): SecretScope[] {
	const { scope, env, org } = input;
	if (scope === "repo") return [{ kind: "repo" }];
	if (scope === "environment") {
		if (!env) throw new Error("`--scope environment` needs `--env <name>`");
		return [{ kind: "environment", name: env }];
	}
	if (scope === "organization") {
		if (!org) throw new Error("`--scope organization` needs `--org <name>` or `org` in holocron.config.ts");
		return [{ kind: "organization", name: org }];
	}
	return [
		{ kind: "repo" },
		...(org ? [{ kind: "organization", name: org } as const] : []),
		...(env ? [{ kind: "environment", name: env } as const] : []),
	];
}
