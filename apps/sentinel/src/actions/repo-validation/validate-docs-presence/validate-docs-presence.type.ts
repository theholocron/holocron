import type { GitHubClient } from "@theholocron/github-client";

export interface ValidateDocsPresenceInput {
	client: Pick<GitHubClient, "pulls" | "git">;
	/** `"owner/repo"`. */
	repo: string;
	pullNumber: number;
	/** The PR's own head ref (branch or SHA) — reads each new package's `package.json` there. */
	ref: string;
}

export interface NewPublicPackage {
	/** The `packages/<name>` or `plugins/<name>` directory name. */
	name: string;
	/** The added entry point — where the check's annotation anchors. */
	entry: string;
}

export interface ValidateDocsPresenceResult {
	/** New public packages this PR adds. Empty when it adds none. */
	newPackages: NewPublicPackage[];
	/** Whether the PR changes anything under `docs/` or any `.md` / `.mdx` file. */
	hasDocsChange: boolean;
	/** `true` unless the PR adds a public package without any docs change. */
	valid: boolean;
}
