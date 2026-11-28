import { createEnvLookup, withEnvPrefix } from "@theholocron/env-utils/lookup";

import type { GitHubAppCredentials, GitHubAppEnv } from "./github-app-credentials.type.js";

/**
 * The GitHub App's id and private key: `SENTINEL_GITHUB_APP_ID` and `SENTINEL_GITHUB_APP_PRIVATE_KEY`, else the bare
 * `GITHUB_APP_ID` and `GITHUB_APP_PRIVATE_KEY` a deployment set before the rename still holds (#1864). GitHub reserves
 * the `GITHUB_` prefix for its own secrets, so Sentinel's own convention (`SENTINEL_<NAME>`) is the new name.
 *
 * @param env - The bindings to read (the process environment on Vercel); tests pass a fake.
 * @returns The App id and its private key, never logged.
 * @throws Error naming both spellings of whichever is missing.
 */
export function githubAppCredentials(env: GitHubAppEnv): GitHubAppCredentials {
	const lookup = withEnvPrefix(createEnvLookup(env as Record<string, string | undefined>), "SENTINEL");
	const appId = lookup.get("GITHUB_APP_ID");
	const privateKey = lookup.get("GITHUB_APP_PRIVATE_KEY");
	if (!appId) throw new Error("the GitHub App id is not set: SENTINEL_GITHUB_APP_ID (or GITHUB_APP_ID)");
	if (!privateKey) {
		throw new Error(
			"the GitHub App private key is not set: SENTINEL_GITHUB_APP_PRIVATE_KEY (or GITHUB_APP_PRIVATE_KEY)"
		);
	}
	return { appId, privateKey };
}
