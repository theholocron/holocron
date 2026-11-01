import { classifySpecPath } from "../classify-spec-path/index.js";
import { parseFrontmatter } from "../parse-frontmatter/index.js";
import { specTitle } from "../spec-title/index.js";
import type { SpecAnnouncement, SpecChange } from "../specs.type.js";

/** A file's `status`, or `undefined` when it has no frontmatter or the field is empty. */
const statusOf = (text: string): string | undefined => parseFrontmatter(text)?.get("status")?.value || undefined;

/**
 * Whether a pull request event on one file is worth announcing, and why. Only a spec is (`.notes/*.spec.md` and
 * `docs/wiki/specifications/*.spec.md`), and not one the event removed. On `opened` every spec the pull request
 * touches is: a `new` one, one whose `status` changed, or an `edited` one. A further push (`updated`) is only worth
 * a post when it adds a spec or changes a `status`, so a push that fixes a typo is quiet. `merged` announces that the
 * spec landed.
 */
export function describeSpecChange(change: SpecChange): SpecAnnouncement | undefined {
	if (classifySpecPath(change.path) !== "spec" || change.after === undefined) return undefined;
	const status = statusOf(change.after);
	const previousStatus = change.before === undefined ? undefined : statusOf(change.before);
	const statusChanged = change.before !== undefined && status !== previousStatus;
	const announce = (kind: SpecAnnouncement["kind"]): SpecAnnouncement => ({
		path: change.path,
		title: specTitle(change.path, change.after!),
		kind,
		...(status === undefined ? {} : { status }),
		...(kind === "status" && previousStatus !== undefined ? { previousStatus } : {}),
	});

	if (change.event === "merged") return announce("merged");
	if (change.before === undefined) return announce("new");
	if (statusChanged) return announce("status");
	return change.event === "opened" ? announce("edited") : undefined;
}
