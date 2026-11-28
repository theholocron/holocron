import type { Strategy } from "../merge-strategy/index.js";

/** Merge strategy that adds lists up, dropping repeats and keeping first-seen order. */
export function union<T>(): Strategy<T[]> {
	return { empty: [], merge: (prev, next) => [...new Set([...prev, ...next])] };
}
