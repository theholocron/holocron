/** The bindings that hold the GitHub App's credentials: the `SENTINEL_` names, and the bare ones an older deployment has. */
export interface GitHubAppEnv {
	SENTINEL_GITHUB_APP_ID?: string;
	SENTINEL_GITHUB_APP_PRIVATE_KEY?: string;
	/** The name before #1864, still read when the `SENTINEL_` one is not set. */
	GITHUB_APP_ID?: string;
	/** The name before #1864, still read when the `SENTINEL_` one is not set. */
	GITHUB_APP_PRIVATE_KEY?: string;
}

/** What `createInstallationClient()` takes. */
export interface GitHubAppCredentials {
	appId: string;
	privateKey: string;
}
