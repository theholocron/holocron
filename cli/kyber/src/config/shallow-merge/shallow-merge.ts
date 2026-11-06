import type { Strategy } from "../merge-strategy/index.js";

/** Merge strategy that spreads each fragment's object over the last, so a later fragment overrides per top-level key. */
export function shallowMerge<V extends object>(): Strategy<V> {
	return { empty: {} as V, merge: (prev, next) => ({ ...prev, ...next }) };
}
