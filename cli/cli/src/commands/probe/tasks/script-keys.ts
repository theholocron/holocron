import type { KeyLine } from "./tasks.type.js";

/**
 * The keys of the object `field` (`scripts` in a `package.json`, `tasks` in a `turbo.json`) with their lines; none when
 * the text is not JSON or has no such object.
 */
export function scriptKeys(text: string, field: string): KeyLine[] {
	let value: unknown;
	try {
		value = (JSON.parse(text) as Record<string, unknown>)[field];
	} catch {
		return [];
	}
	if (typeof value !== "object" || value === null) return [];
	const lines = text.split("\n");
	const start = lines.findIndex((l) => l.includes(`"${field}"`));
	return Object.keys(value).map((key) => ({
		key,
		line: lines.findIndex((l, i) => i > start && l.trimStart().startsWith(`"${key}"`)) + 1,
	}));
}
