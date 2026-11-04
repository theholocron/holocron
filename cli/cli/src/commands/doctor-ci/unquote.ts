/** The text of a YAML scalar without its surrounding quotes. */
export function unquote(value: string): string {
	return value.trim().replace(/^(["'])(.*)\1$/, "$2");
}
