import type { EnvLookup } from "./create-env-lookup.js";

/**
 * Return the value of the first variable in `names` that is set and
 * non-empty, or `fallback` when none is. Use it for a precedence chain such
 * as a product-specific name, then the vendor-native name, then a default.
 *
 * @example
 * const dsn = firstEnv(env, ["HOLOCRON_SENTRY_DSN", "SENTRY_DSN"], DEFAULT_DSN);
 */
export function firstEnv(env: EnvLookup, names: readonly string[], fallback: string): string;
export function firstEnv(env: EnvLookup, names: readonly string[], fallback?: string): string | undefined;
export function firstEnv(env: EnvLookup, names: readonly string[], fallback?: string): string | undefined {
	for (const name of names) {
		const value = env.get(name);
		if (value !== undefined) return value;
	}
	return fallback;
}
