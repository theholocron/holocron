import type { PickedRange } from "./deps.type.js";

/** `^1.2.3`, `~1.2.3`, `1.2.3`, `>=1.2.3` -> [1, 2, 3]; null for anything else. */
function minVersion(range: string): [number, number, number] | null {
	const m = range.match(/^[\^~>=\s]*(\d+)\.(\d+)\.(\d+)/) ?? range.match(/^[\^~>=\s]*(\d+)(?:\.(\d+))?(?:\.x)?\s*$/);
	return m ? [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)] : null;
}

function majorsDiffer(ranges: string[]): boolean {
	return new Set(ranges.map((r) => minVersion(r)?.[0])).size > 1;
}

/** The highest of several ranges by minimum version, and whether they disagree on the major. */
export function pickRange(ranges: string[], preferred?: string): PickedRange {
	const unique = [...new Set(ranges)];
	if (preferred && unique.includes(preferred)) return { range: preferred, majorConflict: majorsDiffer(unique) };
	const parsed = unique.map((r) => ({ r, v: minVersion(r) }));
	if (parsed.some((p) => !p.v)) return { range: unique[0] ?? "", majorConflict: unique.length > 1, unparsed: true };
	parsed.sort((a, b) => {
		const [x, y] = [a.v as number[], b.v as number[]];
		for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return (y[i] as number) - (x[i] as number);
		return 0;
	});
	return { range: parsed[0]?.r ?? "", majorConflict: majorsDiffer(unique) };
}
