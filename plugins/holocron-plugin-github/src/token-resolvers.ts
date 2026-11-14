import {
	resolveAdminToken,
	resolveDeployToken,
	resolveIssuesToken,
	resolveOrgToken,
	resolveReadToken,
	resolveReleaseToken,
	resolveSecretsToken,
	resolveSyncToken,
	type ResolveTokenInput,
	resolveUserSyncToken,
} from "./auth.js";

/** Each token's resolver by its environment variable (`HOLOCRON_ADMIN_TOKEN`), which is what `--token-name` carries. */
export const TOKEN_RESOLVERS: Readonly<Record<string, (input: ResolveTokenInput) => string>> = {
	HOLOCRON_READ_TOKEN: resolveReadToken,
	HOLOCRON_ISSUES_TOKEN: resolveIssuesToken,
	HOLOCRON_SYNC_TOKEN: resolveSyncToken,
	HOLOCRON_RELEASE_TOKEN: resolveReleaseToken,
	HOLOCRON_ADMIN_TOKEN: resolveAdminToken,
	HOLOCRON_SECRETS_TOKEN: resolveSecretsToken,
	HOLOCRON_DEPLOY_TOKEN: resolveDeployToken,
	HOLOCRON_USER_SYNC_TOKEN: resolveUserSyncToken,
	HOLOCRON_ORG_TOKEN: resolveOrgToken,
};
