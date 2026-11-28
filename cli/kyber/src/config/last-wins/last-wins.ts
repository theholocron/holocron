import type { Strategy } from "../merge-strategy/index.js";

/** Merge strategy where the last fragment to set the key wins. The key is absent until a fragment sets it. */
export function lastWins<V>(): Strategy<V> {
	return { merge: (_prev, next) => next };
}
