import { PREFIX } from "@theholocron/env-utils/lookup";

import type { NameHolders, NameSource } from "./doctor-variable-owners.type.js";
import { nameIndex } from "./name-index.js";

/** The prefixes a name is renamed to: the organization's, then an application's own. */
const PAIR_PREFIXES = [PREFIX, "SENTINEL", "COMLINK"];

/** A bare name that exists next to its prefixed spelling. */
export interface PrefixedPair {
	bare: NameHolders;
	prefixed: NameHolders;
}

/**
 * The bare names (`X`) that exist beside a prefixed one (`HOLOCRON_X`, `SENTINEL_X`, `COMLINK_X`) in any place. The
 * fallback is deliberate during a rename; a pair that outlives it is a leftover. Sorted by the bare name.
 */
export function findPrefixedPairs(sources: NameSource[]): PrefixedPair[] {
	const index = nameIndex(sources);
	const pairs: PrefixedPair[] = [];
	for (const [key, bare] of [...index].sort(([a], [b]) => (a < b ? -1 : 1))) {
		for (const prefix of PAIR_PREFIXES) {
			const prefixed = index.get(`${prefix}_${key}`);
			if (prefixed) pairs.push({ bare, prefixed });
		}
	}
	return pairs;
}
