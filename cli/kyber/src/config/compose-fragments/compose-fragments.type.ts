import type { Strategy } from "../merge-strategy/index.js";

/** A composable piece of config: an id to dedupe by, and the ids it needs alongside it. */
export interface ConfigFragment {
	/** Unique identifier; a later fragment with the same id replaces an earlier one. */
	id: string;
	/** Ids that must be present in the same compose call. */
	requires?: string[];
}

/** How each key of the composed result is merged from the fragments' values for that key. */
export type MergeStrategies<Composed> = { [K in keyof Composed]-?: Strategy<NonNullable<Composed[K]>> };
