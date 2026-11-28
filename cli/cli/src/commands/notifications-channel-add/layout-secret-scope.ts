import type { SecretScope } from "../../plugin/index.js";
import { repoName } from "../secrets-sync/repo-name/index.js";

/**
 * Where the notification secrets are written, with who may read them (spec `tech-org-secret-visibility`, #2131).
 * A repository or environment scope is returned as it is. An organization scope gets visibility `selected` and the
 * layout's `readers` (as repository names in that organization), so a Discord webhook is never readable by every
 * repository. It fails closed: no `readers` is a problem naming the field, not a silent `all`, and a reader outside the
 * organization is one too. An existing secret with another visibility is narrowed when it is written again.
 *
 * @param scope - The scope the run writes to.
 * @param readers - The layout's `readers`, as `owner/repo`.
 * @returns The scope to write to, or why there is none.
 */
export function layoutSecretScope(
	scope: SecretScope,
	readers: string[] | undefined
): { scope: SecretScope } | { problem: string } {
	if (scope.kind !== "organization") return { scope };
	if (!readers || readers.length === 0) {
		return {
			problem: `the notification secrets would be readable by every repository of ${scope.name}: list the repositories that read them in the layout's \`readers\` (for example ["${scope.name}/<repo>"])`,
		};
	}
	const outside = readers.filter((r) => !r.startsWith(`${scope.name}/`));
	if (outside.length > 0) {
		return {
			problem: `\`readers\` must be repositories of ${scope.name} (owner/repo); not: ${outside.join(", ")}`,
		};
	}
	return { scope: { ...scope, visibility: "selected", repos: [...new Set(readers.map(repoName))] } };
}
