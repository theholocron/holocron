import { pageNames } from "../page-names/index.js";

/**
 * Whether the PR touches a package's documentation: a doc comment added in its source, its `README.md`, or a docs
 * page named after it (see `pageNames`).
 */
export function hasDocsSignal(
	dir: string,
	changedFiles: readonly string[],
	addedCommentLines: readonly string[]
): boolean {
	if (addedCommentLines.length > 0) return true;
	const names = pageNames(dir);
	return changedFiles.some((f) => {
		if (f === `${dir}/README.md`) return true;
		if (!f.startsWith("docs/") || !/\.mdx?$/.test(f)) return false;
		return names.includes(f.slice(f.lastIndexOf("/") + 1).replace(/\.mdx?$/, ""));
	});
}
