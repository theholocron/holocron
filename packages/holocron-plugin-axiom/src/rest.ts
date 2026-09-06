/**
 * Thin typed wrapper over Axiom's REST API, built on the shared
 * `createRestClient` from `@theholocron/cli` (bearer auth, JSON accept
 * headers, `ProviderApiError` on non-2xx / transport failure).
 *
 * Only the three endpoints the `logs` capability + `verifyToken` need:
 *   - `GET  /v2/datasets/{id}` — fetch one dataset
 *   - `POST /v2/datasets`      — create a dataset
 *   - `GET  /v2/user`          — current token's user (token check)
 */

import { createRestClient, type RestClient } from "@theholocron/cli";

export const DEFAULT_BASE_URL = "https://api.axiom.co";

/** Axiom dataset — the subset of fields Holocron reads. */
export interface AxiomDataset {
	id: string;
	name: string;
	description?: string;
}

/** Axiom user — the subset returned by `GET /v2/user`. */
export interface AxiomUser {
	id: string;
	name?: string;
	email?: string;
	emails?: string[];
}

export interface AxiomClientOptions {
	token: string;
	/** Override the API base URL (default `https://api.axiom.co`). */
	baseUrl?: string;
	/** Override `fetch` for tests. */
	fetch?: typeof fetch;
}

export interface AxiomRestClient {
	getDataset(name: string): Promise<AxiomDataset>;
	createDataset(input: { name: string; description?: string }): Promise<AxiomDataset>;
	getCurrentUser(): Promise<AxiomUser>;
}

export function createAxiomClient(opts: AxiomClientOptions): AxiomRestClient {
	const rest: RestClient = createRestClient({
		baseUrl: opts.baseUrl ?? DEFAULT_BASE_URL,
		token: opts.token,
		vendor: "Axiom",
		fetch: opts.fetch,
	});

	return {
		getDataset: (name) => rest.request<AxiomDataset>(`/v2/datasets/${encodeURIComponent(name)}`),
		createDataset: (input) => rest.request<AxiomDataset>("/v2/datasets", { method: "POST", body: input }),
		getCurrentUser: () => rest.request<AxiomUser>("/v2/user"),
	};
}
