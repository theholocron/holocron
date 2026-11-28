/** The prefix a spec name takes when `--name` does not give the whole name. */
export const DEFAULT_SPEC_PREFIX = "tech-";

/** The longest slug taken from a title, cut at a word. */
const MAX_SLUG = 60;

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** A conventional-commit prefix (`feat(ideas): `) and every emoji taken off a title, then kebab-cased and cut at a word. */
function slugOf(title: string): string {
	const slug = title
		.replace(/^\s*\w+(\([^)]*\))?!?:\s*/, "")
		.replace(/\p{Extended_Pictographic}|‍|️/gu, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	if (slug.length <= MAX_SLUG) return slug;
	const cut = slug.slice(0, MAX_SLUG);
	const atWord = cut.lastIndexOf("-");
	return (atWord > 0 ? cut.slice(0, atWord) : cut).replace(/-+$/, "");
}

/**
 * The file name (no `.spec.md`) of the spec for an issue. `name` is the whole name when given (the `.spec.md` or `.md`
 * ending is dropped, and it must be kebab-case); otherwise it is {@link DEFAULT_SPEC_PREFIX} and the title's slug.
 * `undefined` when no name can be made.
 */
export function specName(title: string, name?: string): string | undefined {
	if (name !== undefined) {
		const bare = name.trim().replace(/\.spec\.md$|\.md$/, "");
		return KEBAB.test(bare) ? bare : undefined;
	}
	const slug = slugOf(title);
	return slug ? `${DEFAULT_SPEC_PREFIX}${slug}` : undefined;
}
