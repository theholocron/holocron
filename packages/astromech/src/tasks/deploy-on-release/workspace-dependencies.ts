import type { WorkspacePackage } from "./deploy-on-release.type.js";

/** The `workspace:*` dependencies of `pkg`, as workspace packages (with their current version). */
export function workspaceDependencies(pkg: WorkspacePackage, all: WorkspacePackage[]): WorkspacePackage[] {
	const names = new Set(
		Object.entries(pkg.dependencies)
			.filter(([, spec]) => String(spec).startsWith("workspace:"))
			.map(([name]) => name)
	);
	return all.filter((candidate) => names.has(candidate.name));
}
