import { type ResolveTokenConfig as _ResolveTokenConfig } from "@theholocron/http-client";

export type ResolveTokenConfig = Omit<_ResolveTokenConfig, "getKeyringToken">;

export interface FeatureResolverConfig {
	/** Env var name for this feature, e.g. `"HOLOCRON_ISSUES_TOKEN"`. */
	envName: string;
	/** Keyring account key, e.g. `"github.issues"`. */
	keyringKey: string;
	/** The vendor named in the "no token" message. Default `GitHub`. */
	vendor?: string;
}
