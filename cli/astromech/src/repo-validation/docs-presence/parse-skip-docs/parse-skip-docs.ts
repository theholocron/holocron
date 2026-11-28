import type { SkipDocs } from "../docs-presence.type.js";

/**
 * Finds `[skip docs] reason`, or `[skip docs: pkg-a, pkg-b] reason`, on one line of a PR description or commit
 * body. Like semantic-release's `[skip ci]`, except that the reason after it is what makes it count. `null` when the
 * text has no marker.
 */
export function parseSkipDocs(text: string): SkipDocs | null {
	// Scanned for the marker as a literal and the `]` with indexOf(), not one pattern that looks for the closing `]` from each
	// `[skip docs`, which would read the rest of the text again for every one of them.
	const lastClosing = text.lastIndexOf("]");
	const marker = /\[skip docs/gi;
	for (let found = marker.exec(text); found; found = marker.exec(text)) {
		const after = found.index + found[0].length;
		let close = -1;
		let names: string | undefined;
		if (text[after] === "]") {
			close = after;
		} else if (text[after] === ":") {
			close = text.indexOf("]", after + 1);
			if (close !== -1) names = text.slice(after + 1, close);
		}
		if (close === -1) {
			// With no `]` after this one there is none after any later one either.
			if (lastClosing < after) return null;
			marker.lastIndex = found.index + 1;
			continue;
		}
		const lineEnd = text.indexOf("\n", close + 1);
		const reason = text.slice(close + 1, lineEnd === -1 ? text.length : lineEnd).trim();
		const scope = names?.trim()
			? names
					.split(",")
					.map((name) => name.trim())
					.filter(Boolean)
			: null;
		return { scope, reason };
	}
	return null;
}
