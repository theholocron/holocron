import type { SpecFrontmatter } from "../specs.type.js";

/**
 * Reads a leading `---` block of `key: value` lines, with the line each one is on, plus one level of nesting keyed
 * `parent.child` (the ADR template's `discussion:` / `  github:`). Any other line is skipped. Returns `null` when the
 * text does not open with such a block.
 */
export function parseFrontmatter(content: string): SpecFrontmatter | null {
	const match = /^---\n([\s\S]*?)\n---/.exec(content);
	if (!match) return null;
	const fields: SpecFrontmatter = new Map();
	let parent: string | undefined;
	match[1]!.split("\n").forEach((text, i) => {
		// +2: line 1 is the opening `---`.
		const line = i + 2;
		const kv = /^(\w[\w-]*):\s*(.*)/.exec(text);
		if (kv) {
			fields.set(kv[1]!, { value: kv[2]!.trim(), line });
			parent = kv[1];
			return;
		}
		const nested = /^\s+(\w[\w-]*):\s*(.*)/.exec(text);
		if (nested && parent) fields.set(`${parent}.${nested[1]!}`, { value: nested[2]!.trim(), line });
	});
	return fields;
}
