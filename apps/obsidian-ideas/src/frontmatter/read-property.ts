/**
 * Reads one scalar property from a note's frontmatter, or `undefined` when the note has no frontmatter, the key is
 * missing, or the value is empty (`issue:`, `issue: ""`, `issue: null`, `issue: ~`). Quotes around the value and a
 * trailing ` # comment` are dropped. It reads only what the filing decisions need, not YAML in general.
 */
export function readProperty(text: string, key: string): string | undefined {
	const lines = (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).split(/\r?\n/);
	if (lines[0]?.trimEnd() !== "---") return undefined;
	for (const line of lines.slice(1)) {
		if (/^(---|\.\.\.)\s*$/.test(line)) return undefined;
		const match = /^([^\s:#][^:]*?)\s*:(?:\s+(.*))?$/.exec(line);
		if (match?.[1] !== key) continue;
		const value = (match[2] ?? "")
			.replace(/\s+#.*$/, "")
			.trim()
			.replace(/^(["'])(.*)\1$/, "$2")
			.trim();
		return value === "" || value === "null" || value === "~" ? undefined : value;
	}
	return undefined;
}
