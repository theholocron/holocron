import { readFileSync } from "node:fs";
import { join } from "node:path";

import { discoverWorkspacePackages, parseCatalogs } from "@theholocron/pkg-utils";

/**
 * The packages of this workspace that a pnpm catalog also lists: the minimum versions a plugin accepts
 * as a peer, say. Dependabot reads every catalog entry as an ordinary dependency and would raise it to the
 * latest release, but such an entry is a compatibility floor that is raised by hand, and the package itself
 * is linked with `workspace:`. A package from outside the workspace in a catalog is left out, so it keeps
 * getting updates. Sorted; `[]` when there is no `pnpm-workspace.yaml`.
 */
export function ownCatalogPackages(repoRoot: string): string[] {
	let yaml: string;
	try {
		yaml = readFileSync(join(repoRoot, "pnpm-workspace.yaml"), "utf8");
	} catch {
		return [];
	}
	const listed = new Set(Object.values(parseCatalogs(yaml)).flatMap((catalog) => Object.keys(catalog)));
	const own = discoverWorkspacePackages(repoRoot).flatMap(({ name }) => (name && listed.has(name) ? [name] : []));
	return [...new Set(own)].sort();
}
