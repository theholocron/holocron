import { resolveAxiomConfig } from "../utils/index.js";

/**
 * One line saying where this run's structured logs go, by the same rule the handler's logger uses: they ship to Axiom
 * when `SENTINEL_AXIOM_INGEST_TOKEN` and `AXIOM_DATASET` are both set. Names the dataset (not a secret) and never the
 * token, so a development run does not quietly write into production's dataset.
 */
export function describeLogging(env: Record<string, string | undefined>): string {
	const { axiom } = resolveAxiomConfig({ get: (name: string) => env[name] });
	return axiom
		? `logs: shipped to Axiom, dataset "${axiom.dataset}"`
		: "logs: not shipped to Axiom (SENTINEL_AXIOM_INGEST_TOKEN and AXIOM_DATASET are not both set)";
}
