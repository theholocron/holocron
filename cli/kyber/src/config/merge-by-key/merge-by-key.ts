import type { Strategy } from "../merge-strategy/index.js";

/**
 * Merge strategy for lists of entries that share an identity. An entry whose key was already seen replaces the earlier
 * one in place; new keys append.
 *
 * @param keyOf - The key an entry merges under.
 */
export function mergeByKey<T>(keyOf: (entry: T) => string): Strategy<T[]> {
	return {
		empty: [],
		merge: (prev, next) => {
			const byKey = new Map(prev.map((e) => [keyOf(e), e]));
			for (const e of next) byKey.set(keyOf(e), e);
			return [...byKey.values()];
		},
	};
}
