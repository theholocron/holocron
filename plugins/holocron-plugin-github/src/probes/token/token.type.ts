/** What the `token` probe reads from the plugin: the repo, the API, and how to resolve each feature's token. */
export interface TokenProbeContext {
	/** The plugin's `repo` option, `owner/name`: the repository and organization the reads are made against. */
	repo: string;
	/** The API base URL, without a trailing slash. */
	baseUrl: string;
	/** The `fetch` to use. */
	fetch: typeof fetch;
	/** Resolves a token by its environment variable (`HOLOCRON_ADMIN_TOKEN`), or `undefined` for a name that is not one of the plugin's. Throws an `AuthError` when none is set. */
	resolve: (envName: string) => string | undefined;
	/** The plugin's token names, for the message that says which are valid. */
	tokenNames: readonly string[];
}
