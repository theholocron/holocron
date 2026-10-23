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

/**
 * What the `secrets` capability uses: the dedicated secrets token when one is
 * set, else `github.admin` as before. An explicit `--token` wins either way.
 * Only a missing secrets token falls back; any other error is real.
 */
export function resolveSecretsOrAdminToken(input?: ResolveTokenInput): string {
	try {
		return resolveSecretsToken(input);
	} catch (err) {
		if (err instanceof AuthError) return resolveAdminToken(input);
		throw err;
	}
}

export const resolveDeployToken = createFeatureResolver({
	envName: "HOLOCRON_DEPLOY_TOKEN",
	keyringKey: "github.deploy",
});

export const resolveOrgToken = createFeatureResolver({
	envName: "HOLOCRON_ORG_TOKEN",
	keyringKey: "github.org",
});
