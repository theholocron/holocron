import { type RunGit, runGit } from "@theholocron/kyber/git";

/** One `git config --get` value in a directory, or `undefined` when the key is unset or git fails. */
export function readGitConfig(cwd: string, key: string, run: RunGit = runGit): string | undefined {
	try {
		return run(["config", "--get", key], cwd) || undefined;
	} catch {
		return undefined;
	}
}
