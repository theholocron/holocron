import type { GitHubAppCredentials, GitHubAppInstallation } from "@theholocron/github-client";

/** The three App-JWT calls {@link setInstallationsSuspended} makes; tests pass fakes. */
export interface InstallationApi {
	list(creds: GitHubAppCredentials): Promise<GitHubAppInstallation[]>;
	suspend(creds: GitHubAppCredentials, installationId: number): Promise<void>;
	unsuspend(creds: GitHubAppCredentials, installationId: number): Promise<void>;
}

export interface SetInstallationsSuspendedInput {
	/** The App's id and key. */
	creds: GitHubAppCredentials;
	/** True to suspend every installation of the App, false to unsuspend them. */
	suspended: boolean;
	/** The GitHub calls. Defaults to `@theholocron/github-client`'s. */
	api?: InstallationApi | undefined;
}

export interface SetInstallationsSuspendedResult {
	/** How many installations the App has. */
	total: number;
	/** How many of them this call changed; the ones already in the wanted state are left alone. */
	changed: number;
}
