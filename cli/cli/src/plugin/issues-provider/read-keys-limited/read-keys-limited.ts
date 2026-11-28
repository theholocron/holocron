import { orderKeys } from "../order-keys/index.js";
import type { ReadKeysLimitedInput } from "./read-keys-limited.type.js";

/**
 * Reads an explicit list of issues in creation order until `limit` of them are kept. The keys are sorted by number first
 * (see {@link orderKeys}), then fetched in small steps of at most `concurrency`, each step no bigger than the places
 * still open, so an issue that is later skipped (a pull request, a closed one) is replaced by the next key and nothing
 * beyond the budget is fetched unless a skip made room. Within a step the fetches run together; the results keep the key
 * order. The kept items come back oldest first, whichever end was chosen.
 */
export async function readKeysLimited<T>(input: ReadKeysLimitedInput<T>): Promise<T[]> {
	const { keys, order, limit, concurrency, fetch, keep } = input;
	const ordered = orderKeys(keys, order);
	const kept: T[] = [];
	let next = 0;
	while (kept.length < limit && next < ordered.length) {
		const step = ordered.slice(next, next + Math.min(concurrency, limit - kept.length));
		next += step.length;
		const fetched = await Promise.all(step.map((key) => fetch(key)));
		for (const item of fetched) if (keep(item)) kept.push(item);
	}
	return order === "newest" ? kept.reverse() : kept;
}
