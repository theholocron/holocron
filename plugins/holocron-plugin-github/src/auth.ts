import { AuthError, createFeatureResolver, type ResolveTokenInput } from "@theholocron/cli";

export { AuthError, createFeatureResolver };
export type { ResolveTokenInput };

export const resolveReadToken = createFeatureResolver({
	envName: "HOLOCRON_READ_TOKEN",
	keyringKey: "github.read",
});

export const resolveIssuesToken = createFeatureResolver({
	envName: "HOLOCRON_ISSUES_TOKEN",
	keyringKey: "github.issues",
});

export const resolveSyncToken = createFeatureResolver({
	envName: "HOLOCRON_SYNC_TOKEN",
	keyringKey: "github.sync",
});

export const resolveReleaseToken = createFeatureResolver({
	envName: "HOLOCRON_RELEASE_TOKEN",
	keyringKey: "github.release",
});

export const resolveAdminToken = createFeatureResolver({
	envName: "HOLOCRON_ADMIN_TOKEN",
	keyringKey: "github.admin",
});

// Org-level secret writes need an org-resource-owner token with Organization
// "Secrets: read/write", which `github.admin` (repo-scoped) does not carry.
export const resolveSecretsToken = createFeatureResolver({
	envName: "HOLOCRON_SECRETS_TOKEN",
	keyringKey: "github.secrets",
});

export const resolveDeployToken = createFeatureResolver({
	envName: "HOLOCRON_DEPLOY_TOKEN",
	keyringKey: "github.deploy",
});

// Reads and writes the files that map GitHub accounts to members of other services (Discord, Slack, ...) in the
// org's private config repo. Kept apart from `github.org` so that token never needs Contents on every repo.
export const resolveUserSyncToken = createFeatureResolver({
	envName: "HOLOCRON_USER_SYNC_TOKEN",
	keyringKey: "github.user-sync",
});

export const resolveOrgToken = createFeatureResolver({
	envName: "HOLOCRON_ORG_TOKEN",
	keyringKey: "github.org",
});
