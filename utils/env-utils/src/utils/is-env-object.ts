import type { EnvObject, Primitive } from "../types.js";

export function isEnvObject(value: Primitive | EnvObject): value is EnvObject {
	return typeof value === "object";
}
