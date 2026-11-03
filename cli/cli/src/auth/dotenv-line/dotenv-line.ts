/** A value dotenv reads back as written without any quoting: no space, quote, `#`, backslash or line break. */
const PLAIN = /^[A-Za-z0-9_@%+=:,./-]*$/;

/** The quotes dotenv accepts around a value, in the order they are tried. Single quotes keep the value exactly as written. */
const QUOTES = ["'", '"', "`"] as const;

/**
 * `NAME=value` in a form dotenv reads back as the same value, or `null` when there is none.
 *
 * dotenv has no escape for a quote or a backslash: a double-quoted value only turns `\n` and `\r` into line breaks, and
 * leaves every other backslash, an escaped quote included, in the value. So nothing is escaped here. A plain value is
 * written bare; any other is wrapped in the first of `'`, `"` and `` ` `` it does not contain; a value with a line
 * break can only be double-quoted (with `\n` and `\r`) and so must not contain `"` or a backslash. A value that fits
 * none of these is `null`, and the caller says so rather than exporting a different token.
 */
export function dotenvLine(name: string, value: string): string | null {
	if (PLAIN.test(value)) return `${name}=${value}`;
	if (/[\r\n]/.test(value)) {
		if (value.includes('"') || value.includes("\\")) return null;
		return `${name}="${value.replace(/\r/g, "\\r").replace(/\n/g, "\\n")}"`;
	}
	const quote = QUOTES.find((q) => !value.includes(q));
	return quote ? `${name}=${quote}${value}${quote}` : null;
}
