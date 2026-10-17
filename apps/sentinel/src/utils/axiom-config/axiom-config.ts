import type { AxiomLoggerConfig, EnvSource } from "./axiom-config.type.js";

/** `{ axiom: { token, dataset } }` when both vars are set and non-empty, else `{}`. */
export function resolveAxiomConfig(env: EnvSource): AxiomLoggerConfig {
	const token = env.get("SENTINEL_AXIOM_INGEST_TOKEN");
	const dataset = env.get("AXIOM_DATASET");
	return token && dataset ? { axiom: { token, dataset } } : {};
}
