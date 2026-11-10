import type { SecretsScope } from "../secrets-sync/parse-scope/index.js";

/** The key that says which GitHub place a sync entry fills: `secrets:repo`, `variables:org=acme`, `secrets:env=prod`. */
export function feedKey(kind: "secrets" | "variables", scope: SecretsScope): string {
	if (scope.kind === "repo") return `${kind}:repo`;
	return `${kind}:${scope.kind === "organization" ? "org" : "env"}=${scope.name}`;
}
