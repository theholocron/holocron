import type { SkipDocs } from "../docs-presence.type.js";

/**
 * Finds `[skip docs] reason`, or `[skip docs: pkg-a, pkg-b] reason`, on one line of a PR description or commit
 * body. Like semantic-release's `[skip ci]`, except that the reason after it is what makes it count. `null` when the
 * text has no marker.
 */
export function parseSkipDocs(text: string): SkipDocs | null {
	const match = /\[skip docs(?::\s*([^\]]*?))?\][ \t]*([^\n]*)/i.exec(text);
	if (!match) return null;
	const scope = match[1]
		? match[1]
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean)
		: null;
	return { scope, reason: match[2]!.trim() };
}
