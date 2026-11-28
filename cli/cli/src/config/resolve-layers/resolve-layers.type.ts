import type { GitExec } from "@theholocron/git-utils";

/** What `resolveLayers()` reads besides the config. */
export interface ResolveLayersInput {
	/** Where the repository (or a directory inside it) is: its `origin` remote is read here. */
	repoRoot: string;
	/** Reads the remote. Defaults to `git` itself; a test passes a fake. */
	gitExec?: GitExec;
}
