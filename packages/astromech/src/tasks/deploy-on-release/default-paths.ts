import { relative } from "node:path";

import type { WorkspacePackage } from "./deploy-on-release.type.js";
import { workspaceDependencies } from "./workspace-dependencies.js";

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
