import type { ResolveTokenInput } from "../resolve-token/index.js";

/** How {@link createFeatureResolver} finds the token for one feature. */
export interface FeatureResolverConfig {
	/** The variable for this feature's token, such as `MYTOOL_ISSUES_TOKEN`. */
	envName: string;
	/** The keyring account it is stored under, such as `github.issues`. */
	keyringKey: string;
	/** The vendor named in the "no token" message, such as `GitHub`. */
	vendor: string;
	/** The command that stores a token, for the "no token" message, given the keyring account: `mytool auth set <key> <token>`. */
	setCommand?: (keyringKey: string) => string;
	/** Looks an account up in the keyring, such as the `get` of {@link createKeyring}. Default: the keyring is not asked. */
	keyring?: (account: string) => string | null;
}

/** What {@link createFeatureResolver} returns: call it for the token, or it throws {@link AuthError}. */
export type FeatureTokenResolver = (input?: ResolveTokenInput) => string;
