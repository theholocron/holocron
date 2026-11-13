import type { RestClient } from "../utils.js";

/** An Axiom dataset. */
export interface AxiomDataset {
	/** The dataset id. */
	id: string;
	/** The dataset name. */
	name: string;
	/** The dataset description, if it has one. */
	description?: string;
	/**
	 * How many days Axiom keeps data in the dataset (`retentionDays` of `GET /v2/datasets/{id}`). One value for the whole
	 * dataset, so every environment in it shares it. Absent when the API does not return it.
	 */
	retentionDays?: number;
	/** Whether the retention period applies (`useRetentionPeriod`); `false` means data is not aged out by `retentionDays`. */
	useRetentionPeriod?: boolean;
}

/** What to create a dataset with. */
export interface CreateAxiomDatasetInput {
	/** The name of the new dataset. */
	name: string;
	/** A description for the new dataset. */
	description?: string;
}

/** What a query of a dataset is sent with. */
export interface AxiomQueryInput {
	/** The APL query. */
	apl: string;
	/** The start of the time range, an RFC 3339 time. */
	startTime?: string;
	/** The end of the time range, an RFC 3339 time. */
	endTime?: string;
}

const PATH = "/v2/datasets";

export function datasets(rest: RestClient) {
	return {
		/** Get one dataset by name (`GET /v2/datasets/{name}`); the name is URL-encoded. */
		get: (name: string): Promise<AxiomDataset> => rest.request<AxiomDataset>(`${PATH}/${encodeURIComponent(name)}`),

		/** List the datasets the token can see (`GET /v2/datasets`). */
		list: (): Promise<AxiomDataset[]> => rest.request<AxiomDataset[]>(PATH),

		/**
		 * Send events to a dataset (`POST /v1/datasets/{name}/ingest`). An empty list ingests nothing, which is how a token's
		 * right to ingest is tried without writing an event.
		 */
		ingest: (name: string, events: readonly Record<string, unknown>[]): Promise<unknown> =>
			rest.request<unknown>(`/v1/datasets/${encodeURIComponent(name)}/ingest`, { method: "POST", body: events }),

		/** Run an APL query (`POST /v1/datasets/_apl?format=tabular`); the dataset is named in the query. */
		query: (input: AxiomQueryInput): Promise<unknown> =>
			rest.request<unknown>("/v1/datasets/_apl", { method: "POST", body: input, query: { format: "tabular" } }),

		/** Create a dataset (`POST /v2/datasets`). */
		create: (input: CreateAxiomDatasetInput): Promise<AxiomDataset> =>
			rest.request<AxiomDataset>(PATH, { method: "POST", body: input }),
	};
}
