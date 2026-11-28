import type { Coverage } from "@theholocron/cli";

/** What the `token` probe reads from the plugin: the resolved token and the capability it checks it through. */
export interface TokenProbeContext {
	/** The resolved Codecov token, marked secret so it is never printed. Throws an `AuthError` when none is set. */
	token: () => string;
	/** The `coverage` capability, built with that token. */
	coverage: () => Coverage;
	/** `owner/repo` the probe asks about, or `undefined` when the plugin options name no repository. */
	repo: string | undefined;
}

/** What follows `probe codecov token`: the layer the token is held in and which declared token it is. */
export interface TokenProbeArgs {
	/** `--layer <word>`, passed by the CLI when `--environment` named a layer. */
	layer?: string;
	/** `--token-name <VAR>`, passed by the CLI with `--environment`: the declared token being checked. */
	tokenName?: string;
}
