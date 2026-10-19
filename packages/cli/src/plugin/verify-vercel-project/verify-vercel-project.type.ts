export interface VerifyVercelDeploymentProjectOptions {
	/** Injectable for testing. Defaults to the global `fetch`. */
	fetch?: typeof fetch;
	/** Team ID — appended as `teamId` on the request. Omit for a personal account. */
	teamId?: string;
	/** Override base URL for testing. Defaults to https://api.vercel.com. */
	baseUrl?: string;
}
