import { ConfigError } from "../config-error/index.js";
import type { Strategy } from "../merge-strategy/index.js";
import type { ConfigFragment, MergeStrategies } from "./compose-fragments.type.js";

/**
 * Combine config fragments into one object. Fragments dedupe by `id` (the last one with an id wins, in the position of
 * the first), every unmet `requires` is reported in ONE {@link ConfigError}, then each key merges with its strategy.
 *
 * @param strategies - A merge strategy per key of the composed result.
 * @param args - Fragments, or arrays of them.
 */
export function composeFragments<Fragment extends ConfigFragment, Composed>(
	strategies: MergeStrategies<Composed>,
	args: (Fragment | Fragment[])[]
): Composed {
	const byId = new Map<string, ConfigFragment>();
	for (const fragment of args.flat()) byId.set(fragment.id, fragment);
	const fragments = [...byId.values()];

	const errors: string[] = [];
	for (const fragment of fragments) {
		for (const req of fragment.requires ?? []) {
			if (!byId.has(req)) errors.push(`"${fragment.id}" requires "${req}"`);
		}
	}
	if (errors.length > 0) throw new ConfigError(`compose(): unmet dependencies — ${errors.join(", ")}`);

	const result: Record<string, unknown> = {};
	for (const [key, strategy] of Object.entries(strategies as Record<string, Strategy<unknown>>)) {
		let acc = strategy.empty;
		for (const fragment of fragments as unknown as Record<string, unknown>[]) {
			const value = fragment[key];
			if (value === undefined) continue;
			acc = acc === undefined ? value : strategy.merge(acc, value);
		}
		if (acc !== undefined) result[key] = acc;
	}
	return result as Composed;
}
