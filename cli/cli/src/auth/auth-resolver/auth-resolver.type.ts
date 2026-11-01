import type { ResolveTokenInput } from "@theholocron/http-client";
import { type ResolveTokenConfig as _ResolveTokenConfig } from "@theholocron/http-client";

import type { PluginToken } from "../../commands/auth/index.js";

/** Options for a token resolver, without the keyring lookup, which the CLI supplies itself. */
export type ResolveTokenConfig = Omit<_ResolveTokenConfig, "getKeyringToken">;

/** Settings for a feature-specific token resolver: which env var and keyring entry it reads. */
export interface FeatureResolverConfig {
	/** Env var name for this feature, e.g. `"HOLOCRON_ISSUES_TOKEN"`. */
	envName: string;
	/** Keyring account key, e.g. `"github.issues"`. */
	keyringKey: string;
	/** The vendor named in the "no token" message. Default `GitHub`. */
	vendor?: string;
}

/** A resolver from `createFeatureResolver`: call it for the token, or read `token` to see where it looks. */
export type FeatureResolver = ((input?: ResolveTokenInput) => string) & {
	/** The environment variable and keyring entry this resolver reads, for `holocron doctor tokens`. */
	readonly token: PluginToken;
};

/** A resolver from `createResolveToken`: call it for the token, or read `token` to see where it looks. */
export type TokenResolver = ((input?: ResolveTokenInput) => string) & {
	/** The environment variables and keyring entry this resolver reads, for `holocron doctor tokens`. */
	readonly token: PluginToken;
};
