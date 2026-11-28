import type { ChecklyClient } from "../../rest.js";

/** What the `token` probe reads from the plugin: the resolved key and the client built with it. */
export interface TokenProbeContext {
	/** The resolved Checkly API key, marked secret so it is never printed. Throws an `AuthError` when none is set. */
	token: () => string;
	/** The REST client, built with that key. */
	client: () => ChecklyClient;
}

/** What follows `probe checkly token`: the layer the key is held in and which declared token it is. */
export interface TokenProbeArgs {
	/** `--layer <word>`, passed by the CLI when `--environment` named a layer. */
	layer?: string;
	/** `--token-name <VAR>`, passed by the CLI with `--environment`: the declared token being checked. */
	tokenName?: string;
}
