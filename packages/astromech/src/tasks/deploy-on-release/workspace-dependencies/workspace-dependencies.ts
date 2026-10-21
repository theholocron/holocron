import type { WorkspacePackage } from "../workspace-packages/index.js";

/** `pkg`'s direct `workspace:*` dependencies — both `dependencies` and `devDependencies`. */
function directWorkspaceDependencies(pkg: WorkspacePackage, all: WorkspacePackage[]): WorkspacePackage[] {
	const names = new Set(
		[...Object.entries(pkg.dependencies), ...Object.entries(pkg.devDependencies)]
			.filter(([, spec]) => String(spec).startsWith("workspace:"))
			.map(([name]) => name)
	);
	return all.filter((candidate) => names.has(candidate.name));
}

/**
 * Every `workspace:*` dependency of `pkg`, transitively (holocron#1071) —
 * its own direct dependencies, and theirs, and so on — as workspace
 * packages (with their current version). `devDependencies` count too: a
 * shared dev/build-time workspace package (a tsconfig, a lint config, a
 * build script) can still change what gets built or deployed even though
 * it's never imported at runtime.
 *
 * A diamond (two packages depending on the same third one) contributes
 * that third package once, not twice — tracked by a visited set, seeded
 * with `pkg` itself so a dependency cycle (A -> B -> A) can't loop
 * forever either, even though a real workspace graph normally can't have
 * one.
 */
export function workspaceDependencies(pkg: WorkspacePackage, all: WorkspacePackage[]): WorkspacePackage[] {
	const visited = new Set<string>([pkg.name]);
	const result: WorkspacePackage[] = [];
	let frontier = directWorkspaceDependencies(pkg, all);
	while (frontier.length > 0) {
		const next: WorkspacePackage[] = [];
		for (const dep of frontier) {
			if (visited.has(dep.name)) continue;
			visited.add(dep.name);
			result.push(dep);
			next.push(...directWorkspaceDependencies(dep, all));
		}
		frontier = next;
	}
	return result;
}
