import type { EnvObject } from "../types.js";
import { coerceValue } from "./coerce-value.js";
import { parseKey } from "./parse-key.js";
import { setDeep } from "./set-deep.js";

export function buildEnvObject(
	raw: Record<string, string | undefined>,
	parseValues: boolean,
): EnvObject {
	const result: EnvObject = {};

	for (const [key, rawValue] of Object.entries(raw)) {
		if (rawValue == null) continue;
		const path = parseKey(key);
		const value = parseValues ? coerceValue(rawValue) : rawValue;
		setDeep(result, path, value);
	}

	return result;
}
