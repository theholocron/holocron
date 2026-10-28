import { realpathSync } from "node:fs";
import { resolve } from "node:path";

import { defaultListDirs, defaultPaths, defaultReadJson, workspacePackages } from "@theholocron/astromech";

import type { TaskEntryConfig } from "../../config/index.js";

/** `realpathSync`, falling back to the unresolved input on a path that doesn't exist (e.g. a test fixture). */
function tryRealpath(path: string): string {
	try {
		return realpathSync(path);
	} catch {
		return path;
	}
}

/**
 * `delivery.previewDeploy`'s package directory plus its `workspace:*`
 * dependencies' directories (holocron#1023) — the reusable workflow's
 * `paths` input, so a PR touching only an unrelated package in the
 * monorepo skips the actual deploy work instead of spinning up a Vercel
 * preview for every PR regardless of relevance. `undefined` for a
 * root-level consumer (`cwd: "."` or omitted) -- every PR already IS a PR
 * to that package, no filter needed -- or when `cwd` doesn't resolve to
 * any known workspace package (soft-skip; the caller leaves `paths`
 * unset rather than guessing).
 */
export function resolvePreviewDeployPaths(gitRoot: string, cwdValue: string | undefined): string[] | undefined {
	if (!cwdValue || cwdValue === ".") return undefined;
	const all = workspacePackages(gitRoot, { readJson: defaultReadJson, listDirs: defaultListDirs });
	const target = tryRealpath(resolve(gitRoot, cwdValue));
	const pkg = all.find((candidate) => tryRealpath(candidate.dir) === target);
	if (!pkg) return undefined;
	return defaultPaths(gitRoot, pkg, all);
}

/**
 * Returns `tasks` unchanged unless it has a `delivery.previewDeploy` entry
 * with a non-root `with.cwd` and no `with.paths` of its own -- in which
 * case that one entry gets an auto-computed `paths` (see
 * {@link resolvePreviewDeployPaths}), added without mutating the input.
 * An explicit `with.paths` from the repo's own config always wins; this
 * only fills in what the repo didn't already specify.
 */
export function withAutoPreviewDeployPaths(
	tasks: ReadonlyArray<string | TaskEntryConfig>,
	gitRoot: string
): Array<string | TaskEntryConfig> {
	return tasks.map((entry) => {
		if (typeof entry === "string" || entry.name !== "delivery.previewDeploy") return entry;
		const cwdValue = entry.with?.["cwd"];
		if (typeof cwdValue !== "string" || entry.with?.["paths"] !== undefined) return entry;
		const paths = resolvePreviewDeployPaths(gitRoot, cwdValue);
		if (!paths) return entry;
		return { ...entry, with: { ...entry.with, paths } };
	});
}
