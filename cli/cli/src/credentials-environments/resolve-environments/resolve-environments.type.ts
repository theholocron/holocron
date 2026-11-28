import type { GitExec } from "@theholocron/git-utils";

/** What `resolveEnvironments()` reads besides the config; every field but `repoRoot` has a real default. */
export interface ResolveEnvironmentsInput {
	/** Where the repository is (its `git remote` is read here). */
	repoRoot: string;
	/** The process environment `detectEnvironment()` reads. Defaults to `process.env`. */
	env?: Record<string, string | undefined>;
	/** Replaces the `git` invocation, for tests. */
	gitExec?: GitExec;
}
