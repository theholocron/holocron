/**
 * Whether any of `files` (repo-relative, `/`-separated) sits at or under one of
 * `paths` (repo-relative folders). `clients` matches `clients/http/x.ts` but
 * not `clients-old/x.ts`.
 */
export function inScope(files: readonly string[], paths: readonly string[]): boolean {
	const folders = paths.map((path) => path.replace(/^\.\//, "").replace(/\/+$/, ""));
	return files.some((file) => folders.some((folder) => file === folder || file.startsWith(`${folder}/`)));
}
