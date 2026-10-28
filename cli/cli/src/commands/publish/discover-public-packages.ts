import { discoverManifests } from "./discover-manifests.js";

/** The names of `discoverPublicPackageEntries`' packages, without requiring a version. */
export function discoverPublicPackages(cwd: string, group?: string): readonly string[] {
	return discoverManifests(cwd, group).flatMap(({ manifest }) =>
		!manifest.private && manifest.name ? [manifest.name] : []
	);
}
