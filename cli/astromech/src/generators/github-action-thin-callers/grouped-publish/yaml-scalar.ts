/**
 * A value as a YAML scalar for a `with:` entry. Bare `[` and `{` would parse as
 * sequence and mapping nodes, so values that start with one (JSON) are single-quoted
 * and stay strings; a `'` inside is doubled, which is how YAML escapes it in single quotes.
 */
export function yamlScalar(value: unknown): string {
	if (value === true) return "true";
	if (value === false) return "false";
	const text = String(value);
	return text.startsWith("[") || text.startsWith("{") ? `'${text.replaceAll("'", "''")}'` : text;
}
