/** The Vercel values `check monitor` and `check resolved` hand to `resolveVercelBypassHeaders`. */
export interface VercelCredentials {
	/** Read-only token that verifies the deployment belongs to the expected project. */
	vercelToken?: string;
	/** The Vercel team id: the environment's override, else the configured `vercel` provider's `teamId`. */
	vercelTeamId?: string;
	/** The Deployment Protection bypass secret, attached as a header only after the project is verified. */
	bypassSecret?: string;
}
