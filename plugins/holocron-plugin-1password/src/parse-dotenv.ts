/**
 * Parse dotenv text (`op environment secret list --format=dotenv`) into a record.
 *
 * Blank lines and `# comment` lines are skipped, as is a line with no `=`. A leading `export ` is dropped. A value
 * in double quotes has `\n`, `\r`, `\t`, `\"` and `\\` unescaped and may run over several lines; a value in single
 * quotes is taken as written; anything else is the rest of the line, trimmed. Inline `#` comments are not stripped,
 * because a token may contain one.
 */
export function parseDotenv(text: string): Record<string, string> {
	const out: Record<string, string> = {};
	const lines = text.split(/\r?\n/);
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!.trim();
		if (!line || line.startsWith("#")) continue;
		const eq = line.indexOf("=");
		if (eq < 0) continue;
		const key = line
			.slice(0, eq)
			.trim()
			.replace(/^export\s+/, "");
		if (!key) continue;
		const value = line.slice(eq + 1).trim();

		if (value.startsWith('"')) {
			// A quoted value ends at the first unescaped closing quote, which may be on a later line.
			let body = value.slice(1);
			while (!hasClosingQuote(body) && i + 1 < lines.length) {
				body += `\n${lines[++i]!}`;
			}
			out[key] = unescapeDouble(body.slice(0, closingQuoteAt(body)));
			continue;
		}
		if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
			out[key] = value.slice(1, -1);
			continue;
		}
		out[key] = value;
	}
	return out;
}

/** The index of the first `"` not preceded by a backslash, or the whole length when there is none. */
function closingQuoteAt(body: string): number {
	for (let i = 0; i < body.length; i++) {
		if (body[i] === "\\") i++;
		else if (body[i] === '"') return i;
	}
	return body.length;
}

function hasClosingQuote(body: string): boolean {
	return closingQuoteAt(body) < body.length;
}

function unescapeDouble(inner: string): string {
	return inner.replace(/\\([nrt"\\])/g, (_, c: string) => ({ n: "\n", r: "\r", t: "\t", '"': '"', "\\": "\\" })[c]!);
}
