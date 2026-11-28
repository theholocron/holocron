import type { EnvironmentCandidate } from "../environment-layers/index.js";
import type { TriedEnvironments } from "./try-environments.type.js";

/** A provider's "no such Environment": its API error with status 404 (`ProviderApiError`, matched by shape). */
function isNotFound(err: unknown): boolean {
	return typeof err === "object" && err !== null && (err as { status?: unknown }).status === 404;
}

/**
 * Calls `attempt` for each candidate and sorts the answers into found and missing. A 404 is a miss; any other error
 * is thrown. A missing optional Environment is silent; a missing required one is reported by name.
 */
export async function tryEnvironments<T>(
	candidates: EnvironmentCandidate[],
	attempt: (name: string) => Promise<T>
): Promise<TriedEnvironments<T>> {
	const found: TriedEnvironments<T>["found"] = [];
	const missing: string[] = [];
	for (const candidate of candidates) {
		try {
			found.push({ name: candidate.name, result: await attempt(candidate.name) });
		} catch (err) {
			if (!isNotFound(err)) throw err;
			if (!candidate.optional) missing.push(candidate.name);
		}
	}
	return { found, missing };
}
