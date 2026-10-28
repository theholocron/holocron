import { discoverWorkspacePackages, resolveWorkspaceGlobs } from "@theholocron/astromech";

/**
 * `-r --filter=./clients/* --filter=./observability` -- one filter per
 * workspace glob that holds a package. Empty (single-package repo, no `-r`)
 * when the workspace declares no package. Shared by every `pnpm publish`
 * invocation below so a repo with several package roots is covered the same as
 * a `packages/*`-only one.
 */
export function workspaceFilterArgs(cwd: string, group?: string): string[] {
	// Only public packages make this a monorepo to publish: a root beside a private docs site is a single package.
	const found = discoverWorkspacePackages(cwd, { ...(group === undefined ? {} : { group }) }).filter(
		({ manifest }) => !manifest.private
	);
	const globs = resolveWorkspaceGlobs(cwd).include.filter((glob) =>
		found.some(({ relativeDir }) =>
			glob.endsWith("/*") ? relativeDir.startsWith(glob.slice(0, -1)) : relativeDir === glob
		)
	);
	return globs.length > 0 ? ["-r", ...globs.map((glob) => `--filter=./${glob}`)] : [];
}
