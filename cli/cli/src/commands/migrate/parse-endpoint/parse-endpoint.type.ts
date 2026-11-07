import type { ProviderOptions } from "../../../config/index.js";

/** One side of a migration: a provider and the options that point it at a repo, team or workspace. */
export interface Endpoint {
	/** The provider name, e.g. `github` or `linear`. */
	provider: string;
	/** Options given on the command line; they win over the same provider's entry in the config. */
	options: ProviderOptions;
}
