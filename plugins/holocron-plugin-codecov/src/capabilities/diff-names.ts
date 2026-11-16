import type { CoverageNameDiff } from "@theholocron/cli";

/** Compares the names a config declares with the names a service has: which are missing there and which are extra. Both sorted. */
export function diffNames(expected: readonly string[], actual: readonly string[]): CoverageNameDiff {
	const want = [...new Set(expected)].sort();
	const have = new Set(actual);
	const wanted = new Set(want);
	return {
		expected: want,
		missing: want.filter((name) => !have.has(name)),
		extra: [...have].filter((name) => !wanted.has(name)).sort(),
	};
}
