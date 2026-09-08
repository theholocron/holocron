/**
 * Deep-merge two config objects, `vite`-style:
 *
 * - plain objects merge recursively
 * - arrays concatenate (`base` first, then `override`)
 * - an `undefined` value in `override` is skipped (keeps `base`)
 * - every other `override` value replaces `base`
 *
 * Neither input is mutated.
 */
export function mergeConfig<T>(base: T, override: unknown): T {
	if (!isPlainObject(base) || !isPlainObject(override)) {
		return override === undefined ? base : (override as T);
	}
	const out: Record<string, unknown> = { ...base };
	for (const [key, value] of Object.entries(override)) {
		if (value === undefined) continue;
		const prev = out[key];
		if (Array.isArray(prev) && Array.isArray(value)) {
			out[key] = [...prev, ...value];
		} else if (isPlainObject(prev) && isPlainObject(value)) {
			out[key] = mergeConfig(prev, value);
		} else {
			out[key] = value;
		}
	}
	return out as T;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
	const proto = Object.getPrototypeOf(value) as unknown;
	return proto === Object.prototype || proto === null;
}
