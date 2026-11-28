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
	// includeDevDependencies: true -- a change to a shared dev/build-time
	// workspace package (a tsconfig, a lint config) can still affect what
	// gets built, so it should count toward "does this touch my paths"
	// (holocron#1071). Unlike deployOnRelease's separate publish-wait use
	// of workspaceDependencies(), nothing here waits on npm to publish
	// anything, so there's no risk of waiting forever on an unpublished
	// dev-only package.
	return [pkg, ...workspaceDependencies(pkg, all, { includeDevDependencies: true })].map(
		// `relative()` uses the host's native separator -- `\` on Windows --
		// but every consumer of this output (GitHub's PR-files API, git
		// itself) always reports paths with `/`. Normalized unconditionally
		// rather than via node:path's `sep` so the behavior doesn't depend
		// on which OS actually ran this (holocron#1069 review).
		({ dir }) => `${relative(repoRoot, dir).replace(/\\/g, "/")}/`
	);
}
