import { discoverManifests } from "./discover-manifests.js";
import type { PublicPackageEntry } from "./public-package-entry.type.js";

/**
 * Every public package (`!private && name`) with its version and a
 * `pnpm --filter`-ready path — {@link runSteadyPublish}'s `skipAlreadyPublished`
 * mode needs both to check `npm view <pkg>@<version>` and publish one
 * workspace at a time.
 */
export function discoverPublicPackageEntries(cwd: string): readonly PublicPackageEntry[] {
	return discoverManifests(cwd).flatMap(({ manifest, dir }) =>
		!manifest.private && manifest.name && manifest.version
			? [{ name: manifest.name, version: manifest.version, dir }]
			: []
	);
}
