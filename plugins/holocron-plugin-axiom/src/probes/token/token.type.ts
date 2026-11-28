import type { AxiomClient } from "../../rest.js";

/** What the `token` probe reads from the plugin: the dataset, the token and a client built with it. */
export interface TokenProbeContext {
	/** The plugin's options; only the dataset is read, to know which one to try when none is named. */
	options: { dataset?: string };
	/** The client the token is used through. */
	client: () => AxiomClient;
	/** The resolved API token, marked secret so it is never printed. Throws an `AuthError` when none is set. */
	token: () => string;
}
