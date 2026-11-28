import { discoverManifests } from "./discover-manifests.js";
import type { WorkspaceScope } from "./workspace-scope.type.js";

/** The names of `discoverPublicPackageEntries`' packages, without requiring a version. */
export function discoverPublicPackages(cwd: string, scope: WorkspaceScope = {}): readonly string[] {
	return discoverManifests(cwd, scope).flatMap(({ manifest }) =>
		!manifest.private && manifest.name ? [manifest.name] : []
	);
}
