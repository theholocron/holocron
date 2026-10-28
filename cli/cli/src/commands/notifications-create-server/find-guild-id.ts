/** Where a `guildId` value sits in a config file: the span of the digits, inside their quotes. */
export interface GuildIdSpan {
	start: number;
	end: number;
}

interface Token {
	kind: "word" | "string" | "punct";
	text: string;
	/** For a string: where its content starts and ends, quotes excluded. */
	start: number;
	end: number;
}

/**
 * Every `guildId: "<digits>"` property in the source, found by reading it as code: comments are skipped and a
 * string is one piece, so a `guildId` inside a comment or inside another string is not a property. The key may be
 * bare or quoted. It reads tokens, not a full syntax tree, which is enough to tell a property from text.
 */
export function findGuildId(source: string): GuildIdSpan[] {
	const tokens: Token[] = [];
	let i = 0;
	while (i < source.length) {
		const ch = source[i]!;
		if (/\s/.test(ch)) {
			i++;
		} else if (source.startsWith("//", i)) {
			const nl = source.indexOf("\n", i);
			i = nl === -1 ? source.length : nl + 1;
		} else if (source.startsWith("/*", i)) {
			const close = source.indexOf("*/", i + 2);
			i = close === -1 ? source.length : close + 2;
		} else if (ch === '"' || ch === "'" || ch === "`") {
			let j = i + 1;
			while (j < source.length && source[j] !== ch) j += source[j] === "\\" ? 2 : 1;
			tokens.push({ kind: "string", text: source.slice(i + 1, j), start: i + 1, end: j });
			i = j + 1;
		} else if (/[\w$]/.test(ch)) {
			let j = i + 1;
			while (j < source.length && /[\w$]/.test(source[j]!)) j++;
			tokens.push({ kind: "word", text: source.slice(i, j), start: i, end: j });
			i = j;
		} else {
			tokens.push({ kind: "punct", text: ch, start: i, end: i + 1 });
			i++;
		}
	}

	const found: GuildIdSpan[] = [];
	for (let t = 0; t + 2 < tokens.length; t++) {
		const [key, colon, value] = [tokens[t]!, tokens[t + 1]!, tokens[t + 2]!];
		if (key.kind === "punct" || key.text !== "guildId") continue;
		if (colon.text !== ":" || colon.kind !== "punct") continue;
		if (value.kind === "string" && /^\d{1,20}$/.test(value.text))
			found.push({ start: value.start, end: value.end });
	}
	return found;
}
