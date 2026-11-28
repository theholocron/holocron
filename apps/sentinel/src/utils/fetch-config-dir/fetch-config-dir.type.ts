import type { ConfigDirFile } from "@theholocron/datapad";
import type { GitHubClient } from "@theholocron/github-client";

export interface FetchConfigDirInput {
	client: Pick<GitHubClient, "git">;
	/** `"owner/repo"`. */
	repo: string;
	/** The directory to fetch, from the repo root: `".holocron"`. */
	dir: string;
	/** The ref the config was read at; `undefined` is the default branch. */
	ref?: string;
}

/** The files of the directory, with `path` kept from the repo root so they can be written beside the config. */
export type FetchConfigDirResult = ConfigDirFile[];
