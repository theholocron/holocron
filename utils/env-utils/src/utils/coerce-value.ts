import type { Primitive } from "../types.js";

const DECIMAL_RE = /^-?\d+(\.\d+)?$/;

export function coerceValue(value: string): Primitive {
	if (value === "true") return true;
	if (value === "false") return false;
	if (DECIMAL_RE.test(value)) return Number(value);
	return value;
}
