import { AuthError, createFeatureResolver, type ResolveTokenInput } from "@theholocron/cli";

export { AuthError, createFeatureResolver };
export type { ResolveTokenInput };

/** Resolves the token for read-only GitHub access (`HOLOCRON_READ_TOKEN`, keyring key `github.read`). */
export const resolveReadToken = createFeatureResolver({
	envName: "HOLOCRON_READ_TOKEN",
	keyringKey: "github.read",
});

/** Resolves the token for issue operations (`HOLOCRON_ISSUES_TOKEN`, keyring key `github.issues`). */
export const resolveIssuesToken = createFeatureResolver({
	envName: "HOLOCRON_ISSUES_TOKEN",
	keyringKey: "github.issues",
});

/** Resolves the token for syncing repo files and settings (`HOLOCRON_SYNC_TOKEN`, keyring key `github.sync`). */
export const resolveSyncToken = createFeatureResolver({
	envName: "HOLOCRON_SYNC_TOKEN",
	keyringKey: "github.sync",
});

/** Resolves the token for release operations (`HOLOCRON_RELEASE_TOKEN`, keyring key `github.release`). */
export const resolveReleaseToken = createFeatureResolver({
	envName: "HOLOCRON_RELEASE_TOKEN",
	keyringKey: "github.release",
});

/** Resolves the repo-scoped admin token (`HOLOCRON_ADMIN_TOKEN`, keyring key `github.admin`). */
export const resolveAdminToken = createFeatureResolver({
	envName: "HOLOCRON_ADMIN_TOKEN",
	keyringKey: "github.admin",
});

// Org-level secret writes need an org-resource-owner token with Organization
// "Secrets: read/write", which `github.admin` (repo-scoped) does not carry.
/** Resolves the org-level secrets token (`HOLOCRON_SECRETS_TOKEN`, keyring key `github.secrets`). */
export const resolveSecretsToken = createFeatureResolver({
	envName: "HOLOCRON_SECRETS_TOKEN",
	keyringKey: "github.secrets",
});

/** Resolves the token for deployment operations (`HOLOCRON_DEPLOY_TOKEN`, keyring key `github.deploy`). */
export const resolveDeployToken = createFeatureResolver({
	envName: "HOLOCRON_DEPLOY_TOKEN",
	keyringKey: "github.deploy",
});

// Reads and writes the files that map GitHub accounts to members of other services (Discord, Slack, ...) in the
// org's private config repo. Kept apart from `github.org` so that token never needs Contents on every repo.
/**
 * Resolves the token for the user-sync files in the org's private config repo (`HOLOCRON_USER_SYNC_TOKEN`, keyring
 * key `github.user-sync`).
 */
export const resolveUserSyncToken = createFeatureResolver({
	envName: "HOLOCRON_USER_SYNC_TOKEN",
	keyringKey: "github.user-sync",
});

/** Resolves the org-level token (`HOLOCRON_ORG_TOKEN`, keyring key `github.org`). */
export const resolveOrgToken = createFeatureResolver({
	envName: "HOLOCRON_ORG_TOKEN",
	keyringKey: "github.org",
});
