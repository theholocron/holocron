/** `value` without the slashes at its end. A scan from the end, not a pattern, so a long run of slashes costs one pass. */
function withoutTrailingSlashes(value: string): string {
	let end = value.length;
	while (end > 0 && value[end - 1] === "/") end -= 1;
	return value.slice(0, end);
}

/**
 * Whether any of `files` (repo-relative, `/`-separated) sits at or under one of
 * `paths` (repo-relative folders). `clients` matches `clients/http/x.ts` but
 * not `clients-old/x.ts`.
 */
export function inScope(files: readonly string[], paths: readonly string[]): boolean {
	const folders = paths.map((path) => withoutTrailingSlashes(path.replace(/^\.\//, "")));
	return files.some((file) => folders.some((folder) => file === folder || file.startsWith(`${folder}/`)));
}

/**
 * Whether any of `files` sits **outside** every one of `folders`: the mirror of
 * {@link inScope}. A commit that only touches the version groups' folders is out;
 * one that touches anything else, even beside a group's files, is in.
 */
export function outsideFolders(files: readonly string[], folders: readonly string[]): boolean {
	const normalized = folders.map((folder) => withoutTrailingSlashes(folder.replace(/^\.\//, "")));
	return files.some((file) => !normalized.some((folder) => file === folder || file.startsWith(`${folder}/`)));
}
