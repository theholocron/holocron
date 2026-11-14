import type { PluginToken } from "@theholocron/cli";

import {
	resolveAdminToken,
	resolveDeployToken,
	resolveIssuesToken,
	resolveOrgToken,
	resolveReadToken,
	resolveReleaseToken,
	resolveSecretsToken,
	resolveSyncToken,
	resolveUserSyncToken,
} from "./auth.js";
import { EXPECTED } from "./probes/token/expectations.js";

/** Adds what a layer's token must and must not be able to do (`EXPECTED`, by `envName`) to a token. */
function declared(token: PluginToken): PluginToken {
	return { ...token, expect: EXPECTED[token.envName]! };
}

/**
 * Every token this plugin takes, for `holocron doctor tokens`, with what each layer's token must and must not be able
 * to do. The release token is `optional`: only CI's release workflow reads it (from the org secret), so a development
 * environment has no reason to hold it.
 */
export const tokens: PluginToken[] = [
	declared(resolveReadToken.token),
	declared(resolveIssuesToken.token),
	declared(resolveSyncToken.token),
	declared({ ...resolveReleaseToken.token, optional: true }),
	declared(resolveAdminToken.token),
	declared(resolveSecretsToken.token),
	declared(resolveDeployToken.token),
	declared(resolveUserSyncToken.token),
	declared(resolveOrgToken.token),
];
