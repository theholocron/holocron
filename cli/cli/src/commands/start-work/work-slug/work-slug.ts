/** The longest slug taken from a title, cut at a word. */
const MAX_SLUG = 40;

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * The slug of the branch and worktree name. `name` is used whole when given and must be kebab-case; otherwise it is the
 * title with its conventional-commit prefix and emoji taken off, kebab-cased and cut at a word. `undefined` when no
 * slug can be made.
 */
export function workSlug(title: string, name?: string): string | undefined {
	if (name !== undefined) {
		const bare = name.trim();
		return KEBAB.test(bare) ? bare : undefined;
	}
	const slug = title
		.replace(/^\s*\w+(\([^)]*\))?!?:\s*/, "")
		.replace(/\p{Extended_Pictographic}|‍|️/gu, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	if (slug.length <= MAX_SLUG) return slug || undefined;
	const cut = slug.slice(0, MAX_SLUG);
	const atWord = slug[MAX_SLUG] === "-" ? -1 : cut.lastIndexOf("-");
	return (atWord > 0 ? cut.slice(0, atWord) : cut).replace(/-+$/, "");
}
