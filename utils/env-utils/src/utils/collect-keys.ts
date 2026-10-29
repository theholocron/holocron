import type { EnvObject } from "../types.js";

/**
 * Recursively collect all dot-path key names from a nested EnvObject.
 * Used for debug output — we log key names only, never values.
 */
export function collectKeys(obj: EnvObject, prefix = ""): string[] {
	const keys: string[] = [];

	for (const [k, v] of Object.entries(obj)) {
		const full = prefix ? `${prefix}.${k}` : k;

		if (typeof v === "object") {
			keys.push(...collectKeys(v, full));
		} else {
			keys.push(full);
		}
	}

	return keys;
}
