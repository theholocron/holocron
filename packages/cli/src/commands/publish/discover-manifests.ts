import { discoverWorkspacePackages } from "@theholocron/astromech";
import { type PackageJson, readPackageJsonSync } from "@theholocron/pkg-utils";

/**
 * Monorepo (the workspace declares public packages): every workspace
 * package. Single package (it declares none -- no `pnpm-workspace.yaml`, or one
 * listing only private members like a docs site): the root `package.json`.
 * Callers keep the public ones.
 */
export function discoverManifests(cwd: string): { manifest: PackageJson; dir: string }[] {
	const workspace = discoverWorkspacePackages(cwd);
	if (!workspace.some(({ manifest }) => !manifest.private)) {
		const manifest = readPackageJsonSync(cwd);
		return manifest ? [{ manifest, dir: "." }] : [];
	}
	return workspace.map(({ manifest, relativeDir }) => ({ manifest, dir: `./${relativeDir}` }));
}
