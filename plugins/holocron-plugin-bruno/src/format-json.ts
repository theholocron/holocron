/** Prettier's default for a JSON file under this repo's config (`printWidth: 120`, 2-space indent). */
const PRINT_WIDTH = 120;
const INDENT = "  ";

const pad = (depth: number): string => INDENT.repeat(depth);
const isPlain = (value: unknown): boolean => value === null || typeof value !== "object";

/** `column` is how many characters are already on the line before `value`; `comma` is 1 when a `,` follows it. */
function render(value: unknown, depth: number, column: number, comma: number): string {
	if (isPlain(value)) return JSON.stringify(value);

	if (Array.isArray(value)) {
		if (value.length === 0) return "[]";
		if (value.every(isPlain)) {
			const oneLine = `[${value.map((item) => JSON.stringify(item)).join(", ")}]`;
			if (column + oneLine.length + comma <= PRINT_WIDTH) return oneLine;
		}
		const items = value.map((item, i) => {
			const last = i === value.length - 1;
			return `${pad(depth + 1)}${render(item, depth + 1, (depth + 1) * INDENT.length, last ? 0 : 1)}`;
		});
		return `[\n${items.join(",\n")}\n${pad(depth)}]`;
	}

	const entries = Object.entries(value as Record<string, unknown>);
	if (entries.length === 0) return "{}";
	const members = entries.map(([key, member], i) => {
		const prefix = `${pad(depth + 1)}${JSON.stringify(key)}: `;
		return `${prefix}${render(member, depth + 1, prefix.length, i === entries.length - 1 ? 0 : 1)}`;
	});
	return `{\n${members.join(",\n")}\n${pad(depth)}}`;
}

/**
 * `value` as JSON laid out the way this repo's Prettier lays out a `.json` file, so a request file this plugin writes
 * already passes the formatting check: objects expanded one key per line, an array of plain values on one line when it
 * fits in 120 columns, a single newline at the end. (The same layout as astromech's `formatJson`; a plugin imports no
 * astromech.)
 */
export function formatJson(value: unknown): string {
	return `${render(JSON.parse(JSON.stringify(value)) as unknown, 0, 0, 0)}\n`;
}
