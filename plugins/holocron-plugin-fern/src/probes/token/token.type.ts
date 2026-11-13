/** What the `token` probe reads from the plugin: the resolved token. */
export interface TokenProbeContext {
	/** The resolved Fern token, marked secret so it is never printed. Throws an `AuthError` when none is set. */
	token: () => string;
}
