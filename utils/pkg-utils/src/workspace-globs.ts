import { PACKAGES_KEY } from "./pnpm-workspace.ts";

/** The `packages:` entries of a `pnpm-workspace.yaml`, split by whether they include or exclude (`!pattern`) packages. */
export interface WorkspaceGlobs {
	/** Globs of packages to include. */
	include: string[];
	/** Globs of packages to leave out, written with a leading `!` in the file. */
	exclude: string[];
}

/**
 * The `packages:` list of a `pnpm-workspace.yaml`, in file order, each entry
 * normalized (`./` and trailing slashes dropped) and keeping a leading `!` on a
 * negation. The order matters: pnpm applies the entries one after another.
 * See {@link readWorkspaceGlobs} for what is read.
 */
export function readWorkspacePatterns(workspaceYaml: string): string[] {
	const lines = workspaceYaml.split("\n");
	const start = lines.findIndex((line) => PACKAGES_KEY.test(line));
	const patterns: string[] = [];
	if (start === -1) return patterns;

	for (const line of lines.slice(start + 1)) {
		if (line.trim() === "" || /^\s*#/.test(line)) continue;
		const item = /^\s*-\s*(.*)$/.exec(line);
		if (!item) break;
		const value = item[1]!
			.replace(/(^|\s)#.*$/, "")
			.trim()
			.replace(/^["']|["']$/g, "")
			.trim();
		if (value === "") continue;
		patterns.push(value.startsWith("!") ? `!${normalizeGlob(value.slice(1))}` : normalizeGlob(value));
	}
	return patterns;
}

/**
 * The `packages:` list of a `pnpm-workspace.yaml`. A line-based read of the
 * plain block-list form, not a YAML parse -- the same approach (and for the
 * same reason) as `ensureRootWorkspaceMember()`: the file routinely carries a
 * `catalog:`/`catalogs:`/`overrides:` block after `packages:` that nothing
 * here should have to round-trip. Quotes and trailing comments are stripped;
 * a missing `packages:` key, or the inline `packages: [a, b]` form, reads as no
 * globs (callers fall back to the default roots).
 */
export function readWorkspaceGlobs(workspaceYaml: string): WorkspaceGlobs {
	return splitWorkspacePatterns(readWorkspacePatterns(workspaceYaml));
}

/** Ordered patterns (`!` for a negation) split into the {@link WorkspaceGlobs} lists. */
export function splitWorkspacePatterns(patterns: readonly string[]): WorkspaceGlobs {
	const globs: WorkspaceGlobs = { include: [], exclude: [] };
	for (const pattern of patterns) {
		if (pattern.startsWith("!")) globs.exclude.push(pattern.slice(1));
		else globs.include.push(pattern);
	}
	return globs;
}

/** `./a/b/` -> `a/b`: the form {@link discoverWorkspacePackages} matches against `relativeDir`. */
function normalizeGlob(glob: string): string {
	return glob.replace(/^\.\//, "").replace(/\/+$/, "");
}
