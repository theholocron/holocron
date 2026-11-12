import type { LayerSecrets, VariableDrift } from "./doctor-shared-values.type.js";

/**
 * Compares the variables (the entries a vault holds visible) of `ci` with those of `dev`. The organization's constants
 * live in `ci` and have a copy in `dev`, with no fallback between layers (#2058), so a name `ci` has and `dev` lacks, or
 * one whose value differs, is drift. A `dev` value may differ on purpose, which is why the caller reports it as `info`.
 * Names only come back: the values are compared in memory and dropped. Names are compared without regard to case, and
 * a name in `allow` is left out.
 *
 * @param layers - The layers that were read.
 * @param allow - Names shared on purpose.
 * @returns `undefined` when `ci` or `dev` was not read, so there is nothing to compare.
 */
export function compareVariables(layers: LayerSecrets[], allow: string[]): VariableDrift | undefined {
	const ci = layers.find((l) => l.layer === "ci");
	const dev = layers.find((l) => l.layer === "dev");
	if (!ci || !dev) return undefined;
	const allowed = new Set(allow.map((name) => name.toUpperCase()));
	const variables = (layer: LayerSecrets) =>
		new Map(layer.entries.filter((e) => !e.concealed).map((e) => [e.name.toUpperCase(), e] as const));
	const inDev = variables(dev);
	const missing: string[] = [];
	const differs: string[] = [];
	for (const [key, entry] of variables(ci)) {
		if (allowed.has(key)) continue;
		const copy = inDev.get(key);
		if (!copy) missing.push(entry.name);
		else if (copy.value !== entry.value) differs.push(entry.name);
	}
	return { missing: missing.sort(), differs: differs.sort() };
}
