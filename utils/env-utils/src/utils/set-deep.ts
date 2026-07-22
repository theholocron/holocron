import type { EnvObject, Primitive } from "../types.js";
import { isEnvObject } from "./is-env-object.js";

/**
 * Write `value` into `target` at the nested `path`.
 * Throws on key collisions so misconfigurations surface at startup.
 */
export function setDeep(
	target: EnvObject,
	path: string[],
	value: Primitive,
): void {
	let current: EnvObject = target;

	for (let i = 0; i < path.length - 1; i++) {
		const key = path[i];
		const existing = current[key];

		if (existing !== undefined && !isEnvObject(existing)) {
			throw new Error(
				`[env-parser] Key collision: "${path.slice(0, i + 1).join(".")}" is already a scalar value, cannot also be a namespace`,
			);
		}

		if (!existing || !isEnvObject(existing)) {
			current[key] = {};
		}

		current = current[key] as EnvObject;
	}

	const lastKey = path[path.length - 1];
	const existing = current[lastKey];

	if (existing !== undefined && isEnvObject(existing)) {
		throw new Error(
			`[env-parser] Key collision: "${path.join(".")}" already exists as a namespace`,
		);
	}

	current[lastKey] = value;
}
