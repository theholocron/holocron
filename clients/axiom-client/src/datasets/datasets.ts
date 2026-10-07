import type { RestClient } from "../utils.js";

export interface AxiomDataset {
	id: string;
	name: string;
	description?: string;
}

export interface CreateAxiomDatasetInput {
	name: string;
	description?: string;
}

const PATH = "/v2/datasets";

export function datasets(rest: RestClient) {
	return {
		get: (name: string): Promise<AxiomDataset> => rest.request<AxiomDataset>(`${PATH}/${encodeURIComponent(name)}`),

		create: (input: CreateAxiomDatasetInput): Promise<AxiomDataset> =>
			rest.request<AxiomDataset>(PATH, { method: "POST", body: input }),
	};
}
