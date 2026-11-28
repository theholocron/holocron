import { ADR_DIR, ADR_EXEMPT, SPEC_DIRS } from "../spec-locations/index.js";
import type { SpecKind } from "../specs.type.js";

/**
 * What a repo-relative path is to the ADR and spec check: an `adr` (a `.md` file directly in the ADR folder, other
 * than the template and the README), a `spec` (a `*.spec.md` file directly in `.notes` or the wiki's specifications
 * folder), or `undefined` for anything else, which the check leaves alone. Subfolders are not searched.
 */
export function classifySpecPath(path: string): SpecKind | undefined {
	const slash = path.lastIndexOf("/");
	const dir = path.slice(0, slash);
	const name = path.slice(slash + 1);
	if (dir === ADR_DIR) return name.endsWith(".md") && !ADR_EXEMPT.includes(name) ? "adr" : undefined;
	if (SPEC_DIRS.includes(dir)) return name.endsWith(".spec.md") ? "spec" : undefined;
	return undefined;
}
