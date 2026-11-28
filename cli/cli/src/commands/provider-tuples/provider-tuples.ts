import type { ResolvedHolocronConfig, ResolvedTuple } from "../../config/index.js";

/** The providers a config names, in the order it names them: one tuple per capability entry, so a provider named twice appears twice. */
export function providerTuples(providers: ResolvedHolocronConfig["providers"]): ResolvedTuple[] {
	return Object.values(providers).flatMap((entry) => (entry.cardinality === "single" ? [entry.tuple] : entry.tuples));
}
