export interface EnvLookup {
	/** Return the string value for `key`, or `undefined` if absent or empty. */
	get(key: string): string | undefined;
}

/**
 * Create a lightweight env lookup backed by a fixed source dict or, when
 * called with no arguments, by a lazy read of `process.env` on every call.
 *
 * Use the no-arg form for the application singleton — it always reflects the
 * current state of `process.env` so tests can mutate it freely:
 *
 * @example
 * // singleton — reads process.env lazily
 * export const env = createEnvLookup();
 *
 * // injectable — tests pass a fake dict
 * export function makeEnv(source?: Record<string, string | undefined>) {
 *   return createEnvLookup(source);
 * }
 */
export function createEnvLookup(source?: Record<string, string | undefined>): EnvLookup {
	return {
		get(key: string): string | undefined {
			const val = (source ?? process.env)[key];
			return typeof val === "string" && val ? val : undefined;
		},
	};
}
