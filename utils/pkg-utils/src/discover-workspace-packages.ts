import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { parsePackageJson } from "./parse-package-json.ts";
import { readWorkspacePatterns, splitWorkspacePatterns, type WorkspaceGlobs } from "./workspace-globs.ts";
import type { WorkspacePackageEntry } from "./workspace-package.type.ts";

/** Where packages live when there is no workspace file (or it lists none): the layout before globs were read. */
export const DEFAULT_WORKSPACE_ROOTS: readonly string[] = ["packages", "apps", "plugins"];

/** A workspace pattern that discovery could not interpret and left out. */
export interface SkippedWorkspacePattern {
	/** The pattern as written (a negation keeps its `!`). */
	pattern: string;
	/** Why it was left out, in a sentence. */
	reason: string;
}

/** Options for {@link discoverWorkspacePackages}. */
export interface DiscoverWorkspacePackagesOptions {
	/** Replaces the `package.json` read of a candidate package. Throw when it is absent -- or leave it out to read the real file. */
	readFile?: (path: string) => string;
	/** Replaces the directory listing: the names of the subdirectories of `dir`. Throw an `ENOENT` error when `dir` is absent. */
	listDirs?: (dir: string) => string[];
	/**
	 * Replaces the read of `pnpm-workspace.yaml` and of the root `package.json` (`workspaces`).
	 * Throw (`ENOENT`) when the file is absent -- or leave it out to read the real files.
	 */
	readText?: (path: string) => string;
	/**
	 * Called once for each pattern discovery could not interpret (an unsupported glob form, a path
	 * outside the repo). The pattern is skipped, never thrown; this is how a caller learns of it.
	 */
	onSkippedPattern?: (skipped: SkippedWorkspacePattern) => void;
	/**
	 * Only the packages of one version group: a folder of the repo (`clients`,
	 * `observability`). A package belongs when it is that folder or sits under it.
	 */
	group?: string;
	/**
	 * Leave out the packages of these version groups. A repo that releases some folders on
	 * their own line releases everything else together, and that release must not sweep the
	 * independent groups in.
	 */
	excludeGroups?: readonly string[];
}

/** Deepest directory a `**` follows, a guard against symlink loops. */
const MAX_DEPTH = 32;

/** Directories a wildcard never enters: dependencies and hidden folders (`.git`, `.turbo`). */
const isSkippedDir = (name: string): boolean => name === "node_modules" || name.startsWith(".");

/** A segment of literal characters, `*` and `?` only. Braces, classes and extglobs are not supported. */
const SIMPLE_SEGMENT = /^[^[\]{}()!+@]*$/;

/**
 * Every package the repo's workspace declares, as `listWorkspacePackagesSync()`
 * entries. Where the patterns come from, in order of preference:
 *
 * 1. the `packages:` list of `pnpm-workspace.yaml`;
 * 2. otherwise the `workspaces` field of the root `package.json` (an array, or
 *    `{ "packages": [...] }`), the npm and yarn form;
 * 3. otherwise the {@link DEFAULT_WORKSPACE_ROOTS} as `<root>/*`.
 *
 * `pnpm-workspace.yaml` wins when both files exist, as it does in pnpm.
 *
 * The patterns are applied in order, the way pnpm applies `packages:`: an
 * entry adds the packages it matches and a `!pattern` entry removes the ones
 * collected so far that it matches. The syntax understood:
 *
 * - `*` matches within one path segment (`clients/*`, `pkg-*`) and `?` one character;
 * - `**` as a whole segment matches any number of directories, none included (`apps/**`);
 * - a literal directory is that package (`observability`, `docs/theme`).
 *
 * A wildcard never enters `node_modules` or a hidden directory. A directory is a
 * package only if it has a readable `package.json` holding a JSON object. The
 * repo root (`.`) is not a workspace child and is skipped; callers that treat a
 * root-only repo as a single package read the root manifest themselves.
 *
 * A pattern it cannot interpret (braces, character classes, `..` or an absolute
 * path) never throws: it is skipped and handed to `options.onSkippedPattern`.
 * A directory that does not exist contributes no packages.
 *
 * The result is de-duplicated by directory and stable: patterns in the order
 * given, the packages one pattern finds sorted by path. Nothing is filtered by
 * `name`, `version` or `private`; that is the caller's call, as for
 * `listWorkspacePackagesSync()`.
 *
 * @example
 * ```ts
 * import { discoverWorkspacePackages } from "@theholocron/pkg-utils";
 *
 * const names = discoverWorkspacePackages(repoRoot, { group: "clients" }).map((p) => p.name);
 * ```
 */
export function discoverWorkspacePackages(
	repoRoot: string,
	options: DiscoverWorkspacePackagesOptions = {}
): WorkspacePackageEntry[] {
	const base = resolve(repoRoot);
	const io: Io = {
		readFile: options.readFile ?? ((path: string) => readFileSync(path, "utf8")),
		listDirs: options.listDirs ?? defaultListDirs,
	};

	const entries = new Map<string, WorkspacePackageEntry>();
	for (const pattern of resolveWorkspacePatterns(base, options)) {
		const negated = pattern.startsWith("!");
		const glob = negated ? pattern.slice(1) : pattern;
		if (glob === "." || glob === "") continue;
		const segments = parsePattern(glob);
		if (typeof segments === "string") {
			options.onSkippedPattern?.({ pattern, reason: segments });
			continue;
		}
		if (negated) {
			for (const relativeDir of [...entries.keys()]) {
				if (matchSegments(segments, relativeDir.split("/"))) entries.delete(relativeDir);
			}
			continue;
		}
		for (const entry of expand(base, segments, io)) entries.set(entry.relativeDir, entry);
	}

	const { group, excludeGroups = [] } = options;
	return [...entries.values()].filter(
		({ relativeDir }) =>
			(group === undefined || inGroup(relativeDir, group)) &&
			!excludeGroups.some((excluded) => inGroup(relativeDir, excluded))
	);
}

/** `relativeDir` is the group's folder, or is under it. `clients` holds `clients/http`, not `clients-old/x`. */
function inGroup(relativeDir: string, group: string): boolean {
	const folder = group.replace(/^\.\//, "").replace(/\/+$/, "");
	return relativeDir === folder || relativeDir.startsWith(`${folder}/`);
}

/** The disk access {@link expand} needs. */
interface Io {
	readFile: (path: string) => string;
	listDirs: (dir: string) => string[];
}

function defaultListDirs(dir: string): string[] {
	return readdirSync(dir).filter((name) => {
		try {
			return statSync(join(dir, name)).isDirectory();
		} catch {
			return false;
		}
	});
}

function isAbsent(error: unknown): boolean {
	const code = (error as NodeJS.ErrnoException | undefined)?.code;
	return code === "ENOENT" || code === "ENOTDIR";
}

/** A segment of a parsed pattern: `**`, a literal name, or a matcher for a name with `*` or `?`. */
type Segment = "**" | { literal: string } | { regex: RegExp };

/** The segments of `glob`, or the reason it cannot be interpreted. */
function parsePattern(glob: string): Segment[] | string {
	if (glob.startsWith("/") || /^[A-Za-z]:/.test(glob)) return "an absolute path is not a workspace pattern";
	const segments: Segment[] = [];
	for (const part of glob.split("/")) {
		if (part === "" || part === ".") continue;
		if (part === "..") return "a pattern must stay inside the repo";
		if (part === "**") {
			segments.push("**");
		} else if (!SIMPLE_SEGMENT.test(part) || part.includes("**")) {
			return `unsupported pattern syntax in ${JSON.stringify(part)}`;
		} else if (/[*?]/.test(part)) {
			const source = part
				.replace(/[.+^$|\\]/g, "\\$&")
				.replace(/\*/g, ".*")
				.replace(/\?/g, ".");
			segments.push({ regex: new RegExp(`^${source}$`) });
		} else {
			segments.push({ literal: part });
		}
	}
	return segments;
}

/** Does the directory path (as segments) match the whole pattern? Used by negations. */
function matchSegments(pattern: readonly Segment[], path: readonly string[]): boolean {
	const [head, ...rest] = pattern;
	if (head === undefined) return path.length === 0;
	if (head === "**") {
		return matchSegments(rest, path) || (path.length > 0 && matchSegments(pattern, path.slice(1)));
	}
	if (path.length === 0) return false;
	const matched = "literal" in head ? head.literal === path[0] : head.regex.test(path[0]!);
	return matched && matchSegments(rest, path.slice(1));
}

/** The packages a pattern finds, sorted by path. */
function expand(base: string, segments: readonly Segment[], io: Io): WorkspacePackageEntry[] {
	const found = new Map<string, WorkspacePackageEntry>();
	walk(base, [], segments, io, found, 0);
	return [...found.values()].sort((a, b) => (a.relativeDir < b.relativeDir ? -1 : 1));
}

function walk(
	base: string,
	path: readonly string[],
	segments: readonly Segment[],
	io: Io,
	found: Map<string, WorkspacePackageEntry>,
	depth: number
): void {
	const [head, ...rest] = segments;
	if (head === undefined) {
		const entry = readPackage(base, path, io);
		if (entry) found.set(entry.relativeDir, entry);
		return;
	}
	if (head === "**") {
		walk(base, path, rest, io, found, depth);
		if (depth >= MAX_DEPTH) return;
		for (const name of children(base, path, io)) {
			if (!isSkippedDir(name)) walk(base, [...path, name], segments, io, found, depth + 1);
		}
		return;
	}
	if ("literal" in head) {
		if (head.literal !== "node_modules") walk(base, [...path, head.literal], rest, io, found, depth + 1);
		return;
	}
	for (const name of children(base, path, io)) {
		if (!isSkippedDir(name) && head.regex.test(name)) walk(base, [...path, name], rest, io, found, depth + 1);
	}
}

/** Sorted subdirectory names of `path`; none when it is not there. Other listing errors surface. */
function children(base: string, path: readonly string[], io: Io): string[] {
	try {
		return [...io.listDirs(join(base, ...path))].sort();
	} catch (error) {
		if (isAbsent(error)) return [];
		throw error;
	}
}

function readPackage(base: string, path: readonly string[], io: Io): WorkspacePackageEntry | undefined {
	if (path.length === 0) return undefined;
	const dir = join(base, ...path);
	try {
		const manifest = parsePackageJson(io.readFile(join(dir, "package.json")));
		return manifest ? { name: manifest.name, dir, relativeDir: path.join("/"), manifest } : undefined;
	} catch {
		return undefined;
	}
}

/** The `workspaces` globs of a root `package.json` text: the array form, or `{ packages: [...] }`. */
function readWorkspacesField(text: string): string[] {
	let workspaces: unknown;
	try {
		workspaces = (JSON.parse(text) as { workspaces?: unknown } | null)?.workspaces;
	} catch {
		return [];
	}
	const list = Array.isArray(workspaces) ? workspaces : (workspaces as { packages?: unknown } | undefined)?.packages;
	if (!Array.isArray(list)) return [];
	return list
		.filter((item): item is string => typeof item === "string" && item.trim() !== "")
		.map((item) =>
			item
				.trim()
				.replace(/^(!?)\.\//, "$1")
				.replace(/\/+$/, "")
		);
}

/**
 * The ordered patterns {@link discoverWorkspacePackages} applies (a leading `!`
 * marks a negation): `pnpm-workspace.yaml`, else the root `package.json`
 * `workspaces` field, else the {@link DEFAULT_WORKSPACE_ROOTS} as `<root>/*`.
 */
export function resolveWorkspacePatterns(
	repoRoot: string,
	options: Pick<DiscoverWorkspacePackagesOptions, "readText"> = {}
): string[] {
	const readText = options.readText ?? ((path: string) => readFileSync(path, "utf8"));
	const root = resolve(repoRoot);
	let patterns: string[] = [];
	try {
		patterns = readWorkspacePatterns(readText(join(root, "pnpm-workspace.yaml")));
	} catch {
		// no workspace file -- try package.json#workspaces
		try {
			patterns = readWorkspacesField(readText(join(root, "package.json")));
		} catch {
			// no root manifest either
		}
	}
	return patterns.length > 0 ? patterns : DEFAULT_WORKSPACE_ROOTS.map((dir) => `${dir}/*`);
}

/**
 * The globs {@link discoverWorkspacePackages} scans, split into inclusions and
 * `!` exclusions (the order between them is lost; use {@link resolveWorkspacePatterns}
 * for that). See there for where they come from.
 */
export function resolveWorkspaceGlobs(
	repoRoot: string,
	options: Pick<DiscoverWorkspacePackagesOptions, "readText"> = {}
): WorkspaceGlobs {
	return splitWorkspacePatterns(resolveWorkspacePatterns(repoRoot, options));
}
