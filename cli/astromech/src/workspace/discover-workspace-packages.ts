import { readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import {
	type ListWorkspacePackagesOptions,
	listWorkspacePackagesSync,
	parsePackageJson,
	type WorkspacePackageEntry,
} from "@theholocron/pkg-utils";

import { readWorkspaceGlobs, type WorkspaceGlobs } from "./workspace-globs.js";

/** Where packages live when there is no `pnpm-workspace.yaml` (or it lists none): the layout before globs were read. */
export const DEFAULT_WORKSPACE_ROOTS: readonly string[] = ["packages", "apps", "plugins"];

export interface DiscoverWorkspacePackagesOptions extends Pick<ListWorkspacePackagesOptions, "listDirs" | "readFile"> {
	/** Replaces the read of `pnpm-workspace.yaml`. Throw (`ENOENT`) when it is absent -- or leave it out to read the real file. */
	readText?: (path: string) => string;
}

/** Characters pnpm globs treat specially. A literal directory has none of them. */
const GLOB_CHARS = /[*?[\]{}!]/;

/**
 * Every package the repo's `pnpm-workspace.yaml` declares, as
 * `listWorkspacePackagesSync()` entries -- in glob order, packages within a
 * `<dir>/*` glob sorted by name. Two forms of glob are understood:
 *
 * - `<dir>/*`: each child of `<dir>` that has a `package.json` (`clients/*`).
 * - a literal directory: that directory is the package (`observability`,
 *   `docs/theme`).
 *
 * `!pattern` entries drop matching packages. The repo root (`.`) is not a
 * workspace child and is skipped; callers that treat a root-only repo as a
 * single package read the root manifest themselves. Any other glob throws
 * rather than being silently skipped. Without a `pnpm-workspace.yaml`, or one
 * with no `packages:`, the default roots are scanned.
 *
 * Nothing is filtered by `name`, `version` or `private`; that is the caller's
 * call, as for `listWorkspacePackagesSync()`.
 */
export function discoverWorkspacePackages(
	repoRoot: string,
	options: DiscoverWorkspacePackagesOptions = {}
): WorkspacePackageEntry[] {
	const base = resolve(repoRoot);
	const readFile = options.readFile ?? ((path: string) => readFileSync(path, "utf8"));
	const { include, exclude } = resolveWorkspaceGlobs(base, options);

	const entries = new Map<string, WorkspacePackageEntry>();
	for (const glob of include) {
		if (glob === "." || glob === "") continue;
		for (const entry of expandGlob(base, glob, { readFile, listDirs: options.listDirs })) {
			if (!exclude.some((pattern) => matches(entry.relativeDir, pattern))) entries.set(entry.relativeDir, entry);
		}
	}
	return [...entries.values()];
}

/**
 * The globs {@link discoverWorkspacePackages} scans: the repo's
 * `pnpm-workspace.yaml` `packages:` list, or the {@link DEFAULT_WORKSPACE_ROOTS}
 * as `<root>/*` when there is no such file or it lists none.
 */
export function resolveWorkspaceGlobs(
	repoRoot: string,
	options: Pick<DiscoverWorkspacePackagesOptions, "readText"> = {}
): WorkspaceGlobs {
	const readText = options.readText ?? ((path: string) => readFileSync(path, "utf8"));
	let workspaceYaml = "";
	try {
		workspaceYaml = readText(join(resolve(repoRoot), "pnpm-workspace.yaml"));
	} catch {
		// no workspace file -- fall through to the default roots
	}
	const { include, exclude } = readWorkspaceGlobs(workspaceYaml);
	return { include: include.length > 0 ? include : DEFAULT_WORKSPACE_ROOTS.map((root) => `${root}/*`), exclude };
}

function expandGlob(
	base: string,
	glob: string,
	options: Pick<ListWorkspacePackagesOptions, "listDirs"> & Required<Pick<ListWorkspacePackagesOptions, "readFile">>
): WorkspacePackageEntry[] {
	if (glob.endsWith("/*") && !GLOB_CHARS.test(glob.slice(0, -2))) {
		return listWorkspacePackagesSync(base, { ...options, roots: [glob.slice(0, -2)] });
	}
	if (GLOB_CHARS.test(glob)) {
		throw new TypeError(
			`unsupported workspace pattern ${JSON.stringify(glob)}: only "<dir>/*" and literal directories are supported`
		);
	}
	const rel = relative(base, resolve(base, glob));
	if (isAbsolute(glob) || rel === ".." || rel.startsWith(`..${sep}`)) {
		throw new TypeError(`workspace directory must be inside the repo, got ${JSON.stringify(glob)}`);
	}
	const dir = join(base, glob);
	try {
		const manifest = parsePackageJson(options.readFile(join(dir, "package.json")));
		return manifest ? [{ name: manifest.name, dir, relativeDir: glob, manifest }] : [];
	} catch {
		return [];
	}
}

/** `relativeDir` against an exclusion: the same directory, or a child of `<dir>/*`. */
function matches(relativeDir: string, pattern: string): boolean {
	if (pattern.endsWith("/*")) {
		const parent = pattern.slice(0, -2);
		return relativeDir.startsWith(`${parent}/`) && !relativeDir.slice(parent.length + 1).includes("/");
	}
	return relativeDir === pattern;
}
