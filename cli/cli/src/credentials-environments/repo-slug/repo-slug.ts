import { type GitExec, readGitRemote } from "@theholocron/git-utils";
import { ConfigError } from "@theholocron/kyber/config";

/**
 * The `<org>/<repo>` of the repository at `cwd`, from its `origin` remote. A remote that is missing or cannot be
 * parsed is a `ConfigError` that names the `environment` option as the fix.
 */
export async function repoSlug(cwd: string, exec?: GitExec): Promise<string> {
	const remote = await readGitRemote(cwd, exec ? { exec } : {});
	if (!remote) {
		throw new ConfigError(
			`cannot derive the 1Password Environment name: the \`origin\` remote of ${cwd} is missing or not an owner/repo URL. ` +
				"Give the `credentials` provider an `environment` option to name it."
		);
	}
	return remote.slug;
}
