/**
 * Whether any of `files` (repo-relative, `/`-separated) sits at or under one of
 * `paths` (repo-relative folders). `clients` matches `clients/http/x.ts` but
 * not `clients-old/x.ts`.
 */
export function inScope(files: readonly string[], paths: readonly string[]): boolean {
	const folders = paths.map((path) => path.replace(/^\.\//, "").replace(/\/+$/, ""));
	return files.some((file) => folders.some((folder) => file === folder || file.startsWith(`${folder}/`)));
}

/**
 * Whether any of `files` sits **outside** every one of `folders`: the mirror of
 * {@link inScope}. A commit that only touches the version groups' folders is out;
 * one that touches anything else, even beside a group's files, is in.
 */
export function outsideFolders(files: readonly string[], folders: readonly string[]): boolean {
	const normalized = folders.map((folder) => folder.replace(/^\.\//, "").replace(/\/+$/, ""));
	return files.some((file) => !normalized.some((folder) => file === folder || file.startsWith(`${folder}/`)));
}
