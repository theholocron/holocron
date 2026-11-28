/** Where a token resolver looks for a token, beyond what it was configured with. */
export interface ResolveTokenInput {
	/** The `--token` flag. */
	cliToken?: string;
	/** The environment to read. Default `process.env`; a test passes its own. */
	env?: NodeJS.ProcessEnv;
	/** Looks an account up in the keyring. Replaces the configured lookup and the credential store; a test passes its own. */
	keyring?: (account: string) => string | null;
	/** The active org. It selects the keyring account `<service>.<org>` first. Default: the variable `orgEnvName` names. */
	org?: string;
}

/** How {@link createResolveToken} finds one vendor's token. */
export interface ResolveTokenConfig {
	/** The tool's own variable for this token, such as `MYTOOL_GITHUB_TOKEN`. */
	envName: string;
	/** The vendor's own variable for it, such as `GITHUB_TOKEN`. */
	vendorEnvName: string;
	/** The keyring account the token is stored under, such as `github`. */
	keyringService: string;
	/** The whole message of the {@link AuthError} thrown when no source has a token, saying how to supply one. */
	errorMessage: string;
	/** Looks an account up in the keyring, such as the `get` of {@link createKeyring}. Default: the keyring is not asked. */
	keyring?: (account: string) => string | null;
	/** The variable that names the active org, such as `MYTOOL_ORG`. Default: no org-scoped lookup unless `input.org` is given. */
	orgEnvName?: string;
}

/** What {@link createResolveToken} returns: call it for the token, or it throws {@link AuthError}. */
export type TokenResolver = (input?: ResolveTokenInput) => string;
