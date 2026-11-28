import type { SecretsScope } from "./parse-scope.type.js";

/** `--scope` / `--github-secret-scope`: `repo`, `env=<name>` or `org=<name>`. */
export function parseScope(s: string): SecretsScope {
	if (s === "repo") return { kind: "repo" };
	if (s.startsWith("env=")) return { kind: "environment", name: s.slice("env=".length) };
	if (s.startsWith("org=")) return { kind: "organization", name: s.slice("org=".length) };
	throw new Error(`invalid --scope "${s}" — expected "repo", "env=<name>", or "org=<name>"`);
}
