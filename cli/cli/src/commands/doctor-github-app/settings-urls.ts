import type { GitHubApp, GitHubAppAccount } from "@theholocron/github-client";

/** The App's permissions page (its events are on the same page, under "Subscribe to events"), by who owns it. */
export function appSettingsUrl(app: GitHubApp): string {
	return app.owner?.type === "Organization"
		? `https://github.com/organizations/${app.owner.login}/settings/apps/${app.slug}/permissions`
		: `https://github.com/settings/apps/${app.slug}/permissions`;
}

/** The page where an account accepts an App's new permissions: its installation. */
export function installationSettingsUrl(account: GitHubAppAccount | null, id: number): string {
	if (account?.type === "Organization") {
		return `https://github.com/organizations/${account.login}/settings/installations/${id}`;
	}
	return `https://github.com/settings/installations/${id}`;
}
