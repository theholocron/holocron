import type { GitHubClient } from "@theholocron/github-client";

export interface ValidateDocsPresenceInput {
	client: Pick<GitHubClient, "pulls" | "git">;
	/** `"owner/repo"`. */
	repo: string;
	pullNumber: number;
	/** The PR's own head ref (branch or SHA) — reads each package's `package.json` there. */
	ref: string;
	/** The PR title from the webhook payload; a `feat` here counts like a `feat` commit subject. Empty when absent. */
	prTitle?: string;
	/** The PR description from the webhook payload; a `[skip docs] <reason>` marker here excuses the check. Empty when absent. */
	prBody?: string;
}

export interface NewPublicPackage {
	/** The package folder's own name (the last segment of its path). */
	name: string;
	/** The added entry point — where the check's annotation anchors. */
	entry: string;
}

/** A public package a `feat` changed without a docs signal. */
export interface FeatDocsWarning {
	/** The package folder, e.g. `utils/array-utils`. */
	dir: string;
	/** A changed file of the package — where the check's annotation anchors. */
	path: string;
}

export interface ValidateDocsPresenceResult {
	/** New public packages this PR adds. Empty when it adds none. */
	newPackages: NewPublicPackage[];
	/** Whether the PR changes anything under `docs/` or any `.md` / `.mdx` file. */
	hasDocsChange: boolean;
	/** Whether the PR title or a commit subject is a Conventional Commit `feat`. */
	isFeat: boolean;
	/** The packages of a `feat` that have no docs signal and no `[skip docs]` reason. Empty unless the PR is a `feat`. */
	featWarnings: FeatDocsWarning[];
	/** The packages a `[skip docs]` marker with a reason excused. */
	skipped: Array<{ dir: string; reason: string }>;
	/** A `[skip docs]` marker covered a package but gave no reason, so it did not count. */
	missingReason: boolean;
	/** `true` unless the PR adds a public package without any docs change, or is a `feat` with an unexcused warning. */
	valid: boolean;
}
