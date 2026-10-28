import type { WorkspacePackage } from "../workspace-packages/index.js";
import type { WorkspaceDependenciesOptions } from "./workspace-dependencies.type.js";

/**
 * `pkg`'s direct `workspace:*` dependencies -- `dependencies`, plus
 * `devDependencies` when asked. `pkg.devDependencies` defaults to `{}`:
 * it's optional on `WorkspacePackage` precisely so a caller holding the
 * previous (dev-dependency-less) shape doesn't crash here.
 */
function directWorkspaceDependencies(
	pkg: WorkspacePackage,
	all: WorkspacePackage[],
	includeDevDependencies: boolean
): WorkspacePackage[] {
	const entries = includeDevDependencies
		? [...Object.entries(pkg.dependencies), ...Object.entries(pkg.devDependencies ?? {})]
		: Object.entries(pkg.dependencies);
	const names = new Set(entries.filter(([, spec]) => String(spec).startsWith("workspace:")).map(([name]) => name));
	return all.filter((candidate) => names.has(candidate.name));
}

/**
 * Every `workspace:*` dependency of `pkg`, transitively (holocron#1071) —
 * its own direct dependencies, and theirs, and so on — as workspace
 * packages (with their current version).
 *
 * `includeDevDependencies` defaults to `false`, matching the pre-#1071
 * behavior: a shared dev/build-time workspace package (a tsconfig, a
 * lint config, a build script) counts only when a caller opts in.
 * `defaultPaths` (computing paths that should trigger a rebuild) opts in;
 * `deployOnRelease`'s publish-wait list (waiting for npm to serve a
 * package's RUNTIME dependencies before deploying it) does not -- an
 * unpublished, possibly `private`, dev-only package would never satisfy
 * that wait and the deploy would time out (holocron#1071 review).
 *
 * A diamond (two packages depending on the same third one) contributes
 * that third package once, not twice — tracked by a visited set, seeded
 * with `pkg` itself so a dependency cycle (A -> B -> A) can't loop
 * forever either, even though a real workspace graph normally can't have
 * one.
 */
export function workspaceDependencies(
	pkg: WorkspacePackage,
	all: WorkspacePackage[],
	options?: WorkspaceDependenciesOptions
): WorkspacePackage[] {
	const includeDevDependencies = options?.includeDevDependencies ?? false;
	const visited = new Set<string>([pkg.name]);
	const result: WorkspacePackage[] = [];
	let frontier = directWorkspaceDependencies(pkg, all, includeDevDependencies);
	while (frontier.length > 0) {
		const next: WorkspacePackage[] = [];
		for (const dep of frontier) {
			if (visited.has(dep.name)) continue;
			visited.add(dep.name);
			result.push(dep);
			next.push(...directWorkspaceDependencies(dep, all, includeDevDependencies));
		}
		frontier = next;
	}
	return result;
}
