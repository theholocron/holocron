import { relative } from "node:path";

import { workspaceDependencies } from "../workspace-dependencies/index.js";
import type { WorkspacePackage } from "../workspace-packages/index.js";

/**
 * The paths a release must touch to redeploy `pkg` when its manifest doesn't
 * list them: its own folder plus the folder of every
 * {@link workspaceDependencies} entry. Derived rather than listed so a new or
 * dropped workspace dependency needs no second edit.
 *
 * @returns Repo-relative prefixes, each ending in `/`.
 */
export function defaultPaths(repoRoot: string, pkg: WorkspacePackage, all: WorkspacePackage[]): string[] {
	return [pkg, ...workspaceDependencies(pkg, all)].map(({ dir }) => `${relative(repoRoot, dir)}/`);
}
