import type { EnvObject, Primitive } from "../types.js";
import { isEnvObject } from "./is-env-object.js";

/**
 * Traverse an EnvObject by a path array.
 * Returns undefined (rather than throwing) if any segment is missing,
 * so the consuming app can decide what to do with a missing key.
 */
export function getByPath(
	obj: EnvObject,
	path: string[],
): Primitive | EnvObject | undefined {
	let current: Primitive | EnvObject = obj;

	for (const segment of path) {
		if (!isEnvObject(current)) {
			return undefined;
		}

		if (!(segment in current)) {
			return undefined;
		}

		current = current[segment];
	}

	return current;
}
