import { discoverManifests } from "./discover-manifests.js";

/** The names of `discoverPublicPackageEntries`' packages, without requiring a version. */
export function discoverPublicPackages(cwd: string): readonly string[] {
	return discoverManifests(cwd).flatMap(({ manifest }) =>
		!manifest.private && manifest.name ? [manifest.name] : []
	);
}
