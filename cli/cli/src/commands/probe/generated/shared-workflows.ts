import type { GeneratedRepoFile } from "../../repo-files/index.js";
import type { PackageGenerated } from "./check-generated.js";

/**
 * One line for each package whose config generates a workflow that the root config (or an earlier package) already
 * does: only the first is checked, because `holocron sync --cwd <package>` refuses to overwrite a file another
 * package wrote (holocron#1026). It is worth knowing, not a failure; the usual cause is a preset that gives a package
 * the root's tasks.
 */
export function sharedWorkflows(files: readonly GeneratedRepoFile[], packages: readonly PackageGenerated[]): string[] {
	const owners = new Map(files.map((f) => [f.path, "the root config"]));
	const lines: string[] = [];
	for (const pkg of packages) {
		const shared = pkg.files.filter((f) => owners.has(f.path));
		for (const file of pkg.files) if (!owners.has(file.path)) owners.set(file.path, `package ${pkg.path}`);
		if (shared.length === 0) continue;
		const first = shared[0]!;
		lines.push(
			`package ${pkg.path} also generates ${shared.length} workflow(s) that another config writes, only that copy is checked (${first.path}, from ${owners.get(first.path)}, is one)`
		);
	}
	return lines;
}
