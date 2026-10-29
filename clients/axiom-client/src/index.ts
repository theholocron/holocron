import { datasets } from "./datasets/datasets.js";
import { user } from "./user/user.js";
import { type AxiomClientOptions, createAxiomRestClient } from "./utils.js";

export type { AxiomDataset, CreateAxiomDatasetInput } from "./datasets/datasets.js";
export type { AxiomUser } from "./user/user.js";
export type { AxiomClientOptions } from "./utils.js";

export function createAxiomClient(opts: AxiomClientOptions) {
	const rest = createAxiomRestClient(opts);
	return {
		datasets: datasets(rest),
		user: user(rest),
	};
}

export type AxiomClient = ReturnType<typeof createAxiomClient>;
