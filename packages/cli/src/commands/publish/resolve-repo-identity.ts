import { readGitRemote } from "@theholocron/git-utils";

import type { RepoIdentity } from "./resolve-repo-identity.type.js";
import type { RunPublishInput } from "./run-publish/index.js";

/**
 * One git-remote read for both the org and repo shown in the Trusted
 * Publisher next-steps output — `readGitRemote` already parses out `owner`
 * alongside `repo`, so there's no reason to shell out to git twice for the
 * two halves of the same remote URL.
 */
export async function resolveRepoIdentity(
	cwd: string,
	exec: NonNullable<RunPublishInput["exec"]>
): Promise<RepoIdentity> {
	const remote = await readGitRemote(cwd, {
		exec: async (args, options) => {
			const result = await exec("git", args, options);
			if (result.exitCode !== 0) throw new Error(`git ${args.join(" ")} exited ${result.exitCode}`);
			return result.stdout;
		},
	});
	return { owner: remote?.owner ?? "unknown", repo: remote?.repo ?? "unknown" };
}
