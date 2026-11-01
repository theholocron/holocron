import type { RestClient } from "../utils.js";

/** An Axiom dataset. */
export interface AxiomDataset {
	/** The dataset id. */
	id: string;
	/** The dataset name. */
	name: string;
	/** The dataset description, if it has one. */
	description?: string;
}

/** What to create a dataset with. */
export interface CreateAxiomDatasetInput {
	/** The name of the new dataset. */
	name: string;
	/** A description for the new dataset. */
	description?: string;
}

const PATH = "/v2/datasets";

export function datasets(rest: RestClient) {
	return {
		/** Get one dataset by name (`GET /v2/datasets/{name}`); the name is URL-encoded. */
		get: (name: string): Promise<AxiomDataset> => rest.request<AxiomDataset>(`${PATH}/${encodeURIComponent(name)}`),

		/** Create a dataset (`POST /v2/datasets`). */
		create: (input: CreateAxiomDatasetInput): Promise<AxiomDataset> =>
			rest.request<AxiomDataset>(PATH, { method: "POST", body: input }),
	};
}
