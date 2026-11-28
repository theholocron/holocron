/** `value` without the slashes at its end. A scan from the end, not a pattern, so a long run of slashes costs one pass. */
function withoutTrailingSlashes(value: string): string {
	let end = value.length;
	while (end > 0 && value[end - 1] === "/") end -= 1;
	return value.slice(0, end);
}

/** Turns one glob into the expression a whole path must match: `**` crosses folders, `*` and `?` stay in one. */
function globToRegExp(glob: string): RegExp {
	let out = "";
	for (let i = 0; i < glob.length; i++) {
		const c = glob.charAt(i);
		if (c === "*") {
			if (glob.charAt(i + 1) === "*") {
				const slash = glob.charAt(i + 2) === "/";
				out += slash ? "(?:.*/)?" : ".*";
				i += slash ? 2 : 1;
			} else out += "[^/]*";
		} else if (c === "?") out += "[^/]";
		else out += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
	}
	return new RegExp(`^${out}$`);
}

/**
 * Whether a repository path (forward slashes, from the root) matches one pattern of `repo.labels.areas`. A pattern with
 * a `*` or `?` is a glob (`cli/**`, `docs/**` then `/*.md`); one without is a file (`turbo.json`) or a folder and
 * everything under it (`.holocron`, `.holocron/`).
 */
export function pathMatches(path: string, pattern: string): boolean {
	const clean = path.replace(/^\.?\//, "");
	if (/[*?]/.test(pattern)) return globToRegExp(pattern.replace(/^\.?\//, "")).test(clean);
	const plain = withoutTrailingSlashes(pattern.replace(/^\.?\//, ""));
	return clean === plain || clean.startsWith(`${plain}/`);
}
