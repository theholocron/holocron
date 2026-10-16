import { readGitRemote } from "@theholocron/git-utils";

import type { RunPublishInput } from "./run-publish/index.js";

export async function resolveRepoName(cwd: string, exec: NonNullable<RunPublishInput["exec"]>): Promise<string> {
	const remote = await readGitRemote(cwd, {
		exec: async (args, options) => {
			const result = await exec("git", args, options);
			if (result.exitCode !== 0) throw new Error(`git ${args.join(" ")} exited ${result.exitCode}`);
			return result.stdout;
		},
	});
	return remote?.repo ?? "unknown";
}
