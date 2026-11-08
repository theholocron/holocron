import { lineHunks } from "../line-hunks/index.js";

/** The lines of `text`, each keeping its own line ending, so a missing final newline is a change to the last line. */
function splitLines(text: string): string[] {
	return text === "" ? [] : text.split(/(?<=\n)/);
}

/**
 * `fixed` limited to the changes that touch lines the pull request added (holocron#1950): the auto-fixers
 * (prettier, markdownlint, editorconfig) report on a whole changed file, and rewriting a line the pull request never
 * touched puts someone else's text into its diff and is how two fixers that disagree about a line once committed 34
 * times undoing each other on #1949. `original` is the file as the pull request has it, so `added` (from
 * {@link addedLines}) numbers its lines.
 *
 * A hunk of the fix, a run of lines that changes together, is kept when it replaces or removes a line the pull
 * request added, or inserts next to one. That is the right unit for prettier, whose fix is structural: a table it
 * re-pads is one hunk, so a changed row brings the whole table with it. With `perLine` a run that replaces lines with
 * as many lines is judged line by line instead, for a fixer whose edits are independent (trailing whitespace,
 * indentation, a list marker): an untouched line next to an added one is then left alone. `added` of `undefined`
 * (no patch) keeps the whole fix. Returns `null` when nothing is left to commit.
 */
export function scopeFix(
	original: string,
	fixed: string,
	added: Set<number> | undefined,
	options: { perLine?: boolean } = {}
): string | null {
	if (fixed === original) return null;
	if (added === undefined) return fixed;

	const originalLines = splitLines(original);
	const fixedLines = splitLines(fixed);
	let scoped = "";
	let cursor = 0;
	for (const hunk of lineHunks(originalLines, fixedLines)) {
		scoped += originalLines.slice(cursor, hunk.from).join("");
		const size = hunk.to - hunk.from;
		if (options.perLine && size > 1 && size === hunk.fixedTo - hunk.fixedFrom) {
			for (let k = 0; k < size; k++) {
				const keep = added.has(hunk.from + k + 1) ? fixedLines : originalLines;
				scoped += (keep === fixedLines ? fixedLines[hunk.fixedFrom + k] : originalLines[hunk.from + k])!;
			}
		} else {
			const touchesAdded =
				size > 0
					? Array.from({ length: size }, (_, k) => hunk.from + 1 + k).some((line) => added.has(line))
					: added.has(hunk.from) || added.has(hunk.from + 1);
			scoped += (
				touchesAdded ? fixedLines.slice(hunk.fixedFrom, hunk.fixedTo) : originalLines.slice(hunk.from, hunk.to)
			).join("");
		}
		cursor = hunk.to;
	}
	scoped += originalLines.slice(cursor).join("");
	return scoped === original ? null : scoped;
}
