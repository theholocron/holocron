/** The workspace's README, relative to the repo root: the markdown side of the `docs` pair. */
export const DOCS_FILE = ".bruno/README.md";

/** The text compared and hashed: line endings as `\n`, no trailing whitespace, so `|-` and a final newline agree. */
export const normalizeDocs = (text: string): string => text.replace(/\r\n?/g, "\n").trimEnd();

/**
 * The text two docs are compared and hashed by: {@link normalizeDocs}, and a markdown table written without its padding
 * (each cell trimmed, a separator row as `---`), so a formatter that pads the table's columns, as Prettier does, and
 * Bruno's editor, which does not, give the same text. Only the comparison uses it; a write keeps the text it is given.
 */
export function comparableDocs(text: string): string {
	return normalizeDocs(text)
		.split("\n")
		.map((line) => {
			const row = line.trim();
			if (!row.startsWith("|") || !row.endsWith("|")) return line;
			const cells = row
				.slice(1, -1)
				.split("|")
				.map((cell) => cell.trim())
				.map((cell) =>
					/^:?-+:?$/.test(cell)
						? `${cell.startsWith(":") ? ":" : ""}---${cell.endsWith(":") ? ":" : ""}`
						: cell
				);
			return `| ${cells.join(" | ")} |`;
		})
		.join("\n");
}

/** Where the `docs:` entry sits in a workspace file: its first line and the last line it covers. */
function docsRange(lines: string[]): { start: number; end: number } | undefined {
	const start = lines.findIndex((line) => /^docs:(\s|$)/.test(line));
	if (start === -1) return undefined;
	let end = start;
	for (let i = start + 1; i < lines.length; i += 1) {
		const line = lines[i]!;
		if (line.trim() === "") continue;
		if (/^\s/.test(line)) end = i;
		else break;
	}
	return { start, end };
}

/**
 * The `docs` text of a workspace file (normalized), or `undefined` when the file has no `docs:` key. A `|` or `|-`
 * block and a one-line plain or quoted value are read; a folded (`>`) block is an error, because the sync cannot
 * write it back the way it found it.
 */
export function readDocs(text: string): string | undefined {
	const lines = text.replace(/\r\n?/g, "\n").split("\n");
	const range = docsRange(lines);
	if (!range) return undefined;
	const value = lines[range.start]!.slice("docs:".length).trim();
	const block = /^([|>])(\d?)[+-]?(\s+#.*)?$/.exec(value);
	if (block) {
		if (block[1] === ">") {
			throw new Error(
				".bruno/workspace.yml: docs is a folded (>) block; use a literal (|) block so the sync can read it"
			);
		}
		const body = lines.slice(range.start + 1, range.end + 1);
		const indent = block[2]
			? Number(block[2])
			: Math.min(...body.filter((l) => l.trim() !== "").map((l) => /^ */.exec(l)![0].length));
		if (!Number.isFinite(indent)) return "";
		return normalizeDocs(body.map((l) => l.slice(indent)).join("\n"));
	}
	if (value.startsWith('"')) return normalizeDocs(JSON.parse(value) as string);
	if (value.startsWith("'")) return normalizeDocs(value.slice(1, -1).replaceAll("''", "'"));
	if (value === "" || value === "null" || value === "~") return "";
	return normalizeDocs(value);
}

/** `docs: |-` and the text indented, as Bruno writes it; an empty text is `docs: ''`. */
function docsBlock(docs: string): string[] {
	const text = normalizeDocs(docs);
	if (text === "") return ["docs: ''"];
	const body = text.split("\n");
	const first = body.find((l) => l.trim() !== "");
	const indicator = first !== undefined && /^\s/.test(first) ? "2" : "";
	return [`docs: |${indicator}-`, ...body.map((l) => (l === "" ? "" : `  ${l}`))];
}

/**
 * The workspace file with only its `docs` value replaced, every other byte kept. A file with no `docs:` key gets one
 * at the end, after a blank line.
 */
export function withDocs(text: string, docs: string): string {
	const lines = text.split("\n");
	const range = docsRange(lines);
	const block = docsBlock(docs);
	if (range) {
		lines.splice(range.start, range.end - range.start + 1, ...block);
		return lines.join("\n");
	}
	const body = text.endsWith("\n") || text === "" ? lines.slice(0, -1) : lines;
	const spaced = body.length > 0 && body[body.length - 1] !== "" ? [...body, ""] : body;
	return [...spaced, ...block, ""].join("\n");
}
