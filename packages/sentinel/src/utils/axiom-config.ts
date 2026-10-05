/**
 * Sentinel's Axiom transport config, resolved from the environment for
 * `createLogger()`.
 *
 * Explicit token, not `createLogger()`'s own `AXIOM_TOKEN` auto-detection
 * (holocron#780/#781): `SENTINEL_AXIOM_INGEST_TOKEN` is a separate,
 * narrower-scoped (ingest-only) token, deliberately distinct from whatever a
 * broader `AXIOM_TOKEN` might mean elsewhere in this org — using the generic
 * auto-detected name here would silently widen the credential this deployment
 * actually needs. Falls back to no Axiom transport (not a throw) when either
 * var is unset, matching `createLogger()`'s own "absent → no transport"
 * contract — true in every test run, and in any environment before the two
 * Doppler-sourced values have been synced to Vercel.
 *
 * Its own module, not inline in `handler.ts`, so this rule is tested directly.
 * It used to be tested by re-importing `handler.ts` per case, which loaded
 * every check's linters (prettier, eslint, alex, markdownlint, …) inside the
 * test's own timeout and failed whenever the machine was busy (holocron#934).
 */

/** The slice of `createEnvLookup()`'s result this needs; tests pass a fake. */
export interface EnvSource {
	get(name: string): string | undefined;
}

export interface AxiomLoggerConfig {
	axiom?: { token: string; dataset: string };
}

/** `{ axiom: { token, dataset } }` when both vars are set and non-empty, else `{}`. */
export function resolveAxiomConfig(env: EnvSource): AxiomLoggerConfig {
	const token = env.get("SENTINEL_AXIOM_INGEST_TOKEN");
	const dataset = env.get("AXIOM_DATASET");
	return token && dataset ? { axiom: { token, dataset } } : {};
}
