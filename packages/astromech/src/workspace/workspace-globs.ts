/** The `packages:` entries of a `pnpm-workspace.yaml`, split by whether they include or exclude (`!pattern`) packages. */
export interface WorkspaceGlobs {
	include: string[];
	exclude: string[];
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
	const lines = workspaceYaml.split("\n");
	const start = lines.findIndex((line) => /^packages:\s*(#.*)?$/.test(line));
	const globs: WorkspaceGlobs = { include: [], exclude: [] };
	if (start === -1) return globs;

	for (const line of lines.slice(start + 1)) {
		if (line.trim() === "" || /^\s*#/.test(line)) continue;
		const item = /^\s*-\s*(.*)$/.exec(line);
		if (!item) break;
		const value = item[1]!
			.replace(/\s+#.*$/, "")
			.trim()
			.replace(/^["']|["']$/g, "")
			.trim();
		if (value === "") continue;
		if (value.startsWith("!")) globs.exclude.push(normalizeGlob(value.slice(1)));
		else globs.include.push(normalizeGlob(value));
	}
	return globs;
}

/** `./a/b/` -> `a/b`: the form {@link discoverWorkspacePackages} matches against `relativeDir`. */
function normalizeGlob(glob: string): string {
	return glob.replace(/^\.\//, "").replace(/\/+$/, "");
}
