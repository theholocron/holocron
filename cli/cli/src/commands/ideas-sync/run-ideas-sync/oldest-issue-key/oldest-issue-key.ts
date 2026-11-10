/** The number in an issue key: the last run of digits (`#12`, `ENG-7` and `owner/repo#12` give 12, 7 and 12). */
const numberOf = (key: string): number => {
	const digits = /(\d+)\D*$/.exec(key);
	return digits ? Number(digits[1]) : Number.POSITIVE_INFINITY;
};

/**
 * The key of the oldest issue among `keys`, which is the one that wins when overlapping runs filed the same idea.
 * The `Issue` type carries no creation time, so the order is the key's number, which rises with creation in one
 * repository or team. Two keys with the same number (different repositories) fall back to a plain string compare so
 * every run picks the same winner from the same set. Returns `undefined` for an empty list.
 */
export function oldestIssueKey(keys: readonly string[]): string | undefined {
	let oldest: string | undefined;
	for (const key of keys) {
		if (oldest === undefined) {
			oldest = key;
			continue;
		}
		const a = numberOf(key);
		const b = numberOf(oldest);
		if (a < b || (a === b && key < oldest)) oldest = key;
	}
	return oldest;
}
