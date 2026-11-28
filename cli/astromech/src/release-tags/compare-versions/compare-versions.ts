const PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

/** Splits a version into its three numbers and prerelease identifiers, or `undefined` when it is not semver. */
export function parseVersion(version: string): { numbers: number[]; pre: string[] } | undefined {
	const match = PATTERN.exec(version);
	if (!match) return undefined;
	return {
		numbers: [Number(match[1]), Number(match[2]), Number(match[3])],
		pre: match[4] ? match[4].split(".") : [],
	};
}

const isNumeric = (id: string): boolean => /^\d+$/.test(id);

/**
 * Orders two semver versions: negative when `a` is older, positive when newer, 0 when equal (build metadata is
 * ignored). A prerelease is older than its release, and prerelease identifiers compare as semver says: numbers
 * numerically and below words, words by their characters, fewer identifiers first. Not a version is a `TypeError`.
 */
export function compareVersions(a: string, b: string): number {
	const left = parseVersion(a);
	const right = parseVersion(b);
	if (!left || !right) throw new TypeError(`not a semver version: ${left ? b : a}`);
	for (let i = 0; i < 3; i++) {
		const diff = left.numbers[i] - right.numbers[i];
		if (diff !== 0) return diff;
	}
	if (left.pre.length === 0 || right.pre.length === 0) return right.pre.length - left.pre.length;
	for (let i = 0; i < Math.max(left.pre.length, right.pre.length); i++) {
		const x = left.pre[i];
		const y = right.pre[i];
		if (x === undefined) return -1;
		if (y === undefined) return 1;
		if (x === y) continue;
		if (isNumeric(x) && isNumeric(y)) return Number(x) - Number(y);
		if (isNumeric(x)) return -1;
		if (isNumeric(y)) return 1;
		return x < y ? -1 : 1;
	}
	return 0;
}
