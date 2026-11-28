/** A post's footer line, `-# sync: <key> | <state>`, found in a message. */
export interface Footer {
	/** Where the line starts in the message. */
	index: number;
	/** The whole line. */
	text: string;
	/** The document's path. */
	key: string;
	/** The state the post and the document last agreed on; empty when none. */
	synced: string;
}

/** The marker that starts a footer line. */
const MARKER = "-# sync: ";

/** The separator between the key and the state; the last one in the line splits them, as the key may hold one. */
const SEPARATOR = " | ";

/**
 * The first line of `content` that is a footer: it starts with `-# sync: ` and has a ` | ` after at least one character of
 * key. A state may hold spaces; a key may hold ` | `, so the last one splits the line. Lines end at `\n`, `\r`,
 * `\u2028` or `\u2029`. Read with `indexOf()`, not a pattern, so a long message costs one pass.
 */
export function findFooter(content: string): Footer | null {
	let lineStart = 0;
	while (lineStart <= content.length) {
		let lineEnd = lineStart;
		while (lineEnd < content.length && !"\n\r\u2028\u2029".includes(content[lineEnd])) lineEnd += 1;
		const line = content.slice(lineStart, lineEnd);
		if (line.startsWith(MARKER)) {
			const rest = line.slice(MARKER.length);
			const split = rest.lastIndexOf(SEPARATOR);
			if (split >= 1) {
				return {
					index: lineStart,
					text: line,
					key: rest.slice(0, split),
					synced: rest.slice(split + SEPARATOR.length),
				};
			}
		}
		if (lineEnd >= content.length) return null;
		lineStart = lineEnd + 1;
	}
	return null;
}
