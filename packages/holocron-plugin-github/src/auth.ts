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

export const resolveDeployToken = createFeatureResolver({
	envName: "HOLOCRON_DEPLOY_TOKEN",
	keyringKey: "github.deploy",
});

export const resolveOrgToken = createFeatureResolver({
	envName: "HOLOCRON_ORG_TOKEN",
	keyringKey: "github.org",
});
