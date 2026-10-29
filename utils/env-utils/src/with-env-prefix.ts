import type { EnvLookup } from "./create-env-lookup.js";

/**
 * Wrap an {@link EnvLookup} so every `get(key)` tries `<prefix>_<key>` first
 * and falls back to the bare `key`. Callers name the variable once, and the
 * namespaced override wins when it is set.
 *
 * Pass the prefix without a trailing underscore. Empty values are skipped,
 * as in {@link EnvLookup.get}.
 *
 * The prefix is matched with exact case: `"holocron"` looks up
 * `holocron_TOKEN`, not `HOLOCRON_TOKEN`. An {@link EnvLookup} only answers
 * exact-name `get` calls, so unlike `filterByNamespace` (which scans a whole
 * env record) this cannot match case-insensitively. Environment variable
 * names are conventionally upper case, so pass an upper-case prefix.
 *
 * @example
 * const env = withEnvPrefix(createEnvLookup(), "HOLOCRON");
 * env.get("SENTRY_DSN"); // HOLOCRON_SENTRY_DSN, else SENTRY_DSN
 */
export function withEnvPrefix(env: EnvLookup, prefix: string): EnvLookup {
	return {
		get(key: string): string | undefined {
			return env.get(`${prefix}_${key}`) ?? env.get(key);
		},
	};
}
