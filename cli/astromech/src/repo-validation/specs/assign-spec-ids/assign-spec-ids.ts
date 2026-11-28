import type { SpecToNumber } from "../specs.type.js";

/** `SPEC-` and four digits: the id a spec carries in its front matter. */
const SPEC_ID = /^SPEC-(\d+)$/;

/**
 * The ids the specs without one should take. They are numbered after the highest id any spec has, one after another,
 * oldest first (by when the file was first committed, then by path), so numbering a whole tree gives the same result
 * every time and a new spec always takes the next number. A spec that already has an id keeps it and is not in the
 * result. Ids are `SPEC-` and at least four digits.
 */
export function assignSpecIds(specs: readonly SpecToNumber[]): Map<string, string> {
	const taken = specs.flatMap((s) => {
		const match = s.id === undefined ? null : SPEC_ID.exec(s.id);
		return match ? [Number(match[1])] : [];
	});
	let next = Math.max(0, ...taken) + 1;

	const unnumbered = specs
		.filter((s) => !s.id)
		.sort((a, b) => (a.time ?? Infinity) - (b.time ?? Infinity) || a.path.localeCompare(b.path));
	return new Map(unnumbered.map((s) => [s.path, `SPEC-${String(next++).padStart(4, "0")}`]));
}
