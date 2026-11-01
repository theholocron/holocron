/** Options for {@link stringifyJson}. */
export interface StringifyJsonOptions {
	/**
	 * Indent for each level: a number of spaces (a non-negative integer) or a
	 * string of spaces and tabs (e.g. `"\t"`). Any length works, unlike
	 * `JSON.stringify`'s own ten-character cap. Default `2`.
	 */
	indent?: number | string;
	/**
	 * The existing file's text. Its detected indent and line endings are used
	 * instead of `indent`, so rewriting a file doesn't reformat it. Falls back
	 * to `indent` when no indent can be detected (empty or single-line input).
	 * A file that mixes `\r\n` and `\n` keeps whichever it uses more (`\n` on a tie).
	 */
	like?: string;
}

/**
 * The indentation one level of nesting adds in a JSON document — the leading
 * whitespace (spaces or a tab) of the first line after the first one, less any
 * padding the root value's own line starts with. `undefined` when there is
 * none, e.g. a minified or single-line document.
 *
 * Raw newlines can't occur inside a JSON string, so any line that starts with
 * whitespace is structural indentation.
 *
 * @example
 * ```ts
 * import { detectIndent } from "@theholocron/json-utils";
 *
 * detectIndent('{\n\t"a": 1\n}'); // "\t"
 * detectIndent('{"a":1}'); // undefined
 * ```
 */
export function detectIndent(text: string): string | undefined {
	const lines = text.split(/\r?\n/);
	const rootAt = lines.findIndex((line) => line.trim() !== "");
	if (rootAt === -1) return undefined;
	const rootPad = (/^[ \t]*/.exec(lines[rootAt] as string) as RegExpExecArray)[0];
	for (const line of lines.slice(rootAt + 1)) {
		const match = /^([ \t]+)\S/.exec(line);
		if (!match) continue;
		const pad = match[1] as string;
		const nested = pad.startsWith(rootPad) ? pad.slice(rootPad.length) : pad;
		if (nested) return nested;
	}
	return undefined;
}

/** `\r\n` when it is the file's majority line ending, else `\n`. */
function detectEol(text: string): "\n" | "\r\n" {
	const crlf = text.match(/\r\n/g)?.length ?? 0;
	const lf = (text.match(/\n/g)?.length ?? 0) - crlf;
	return crlf > lf ? "\r\n" : "\n";
}

function resolveIndent(indent: number | string): string {
	if (typeof indent === "number") {
		if (!Number.isInteger(indent) || indent < 0) {
			throw new TypeError(`indent must be a non-negative integer, got ${indent}`);
		}
		return " ".repeat(indent);
	}
	if (!/^[ \t]*$/.test(indent)) {
		throw new TypeError(`indent must contain only spaces and tabs, got ${JSON.stringify(indent)}`);
	}
	return indent;
}

/**
 * `JSON.stringify` pretty-printed and ending in exactly one newline — the shape
 * every `package.json`-style file on disk should have.
 *
 * Pass the file's current text as `like` to keep its own indent (tabs, 4
 * spaces, …) and line endings (`\r\n`) when rewriting it.
 *
 * @throws {TypeError} when `value` has no JSON representation (`undefined`, a
 * function, a symbol) — `JSON.stringify` would return `undefined` for it — or
 * when `indent` isn't a non-negative integer or a string of spaces and tabs
 * (anything else would produce text no JSON parser accepts).
 *
 * @example
 * ```ts
 * import { stringifyJson } from "@theholocron/json-utils";
 *
 * stringifyJson({ a: 1 }); // '{\n  "a": 1\n}\n'
 *
 * // rewrite a file without reformatting it
 * const original = await readFile("package.json", "utf8");
 * const pkg = JSON.parse(original);
 * pkg.version = "2.0.0";
 * await writeFile("package.json", stringifyJson(pkg, { like: original }));
 * ```
 */
export function stringifyJson(value: unknown, options: StringifyJsonOptions = {}): string {
	let indent = resolveIndent(options.indent ?? 2);
	let eol = "\n";
	if (options.like !== undefined) {
		indent = detectIndent(options.like) ?? indent;
		eol = detectEol(options.like);
	}
	// A tab per level, then swapped for `indent`: JSON.stringify caps its own
	// indent at ten characters. Newlines are structural only — it escapes them
	// inside strings — so every line's leading tabs are indentation.
	const json = (indent === "" ? JSON.stringify(value) : JSON.stringify(value, null, "\t")) as string | undefined;
	if (json === undefined) throw new TypeError("Cannot stringify a value that has no JSON representation");
	const indented =
		indent === "" || indent === "\t" ? json : json.replace(/^\t+/gm, (tabs) => indent.repeat(tabs.length));
	return (eol === "\n" ? indented : indented.replace(/\n/g, eol)) + eol;
}
