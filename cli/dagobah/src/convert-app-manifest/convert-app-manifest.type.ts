/** The App GitHub created, as far as this command keeps it. The client id and secret are left out: nothing uses them. */
export interface ConvertedApp {
	/** The numeric App id (`SENTINEL_GITHUB_APP_ID`). Not a secret. */
	id: number;
	/** The App's URL name. */
	slug: string;
	/** The App's page. */
	htmlUrl: string;
	/** The private key, PEM. Shown by GitHub once. A secret. */
	pem: string;
	/** The secret webhook deliveries are signed with. A secret. */
	webhookSecret: string;
}
