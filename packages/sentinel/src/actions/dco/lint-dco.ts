/**
 * Lints a PR's own commits against the Developer Certificate of Origin
 * (DCO) — the org-wide replacement for `probot/dcoapp` (community-
 * maintained, had a real ownership/maintenance scare in 2021:
 * github.com/open-gitops/project/discussions/27), same commit-level
 * Bucket 1 architecture `lint-commits.ts` already proved out.
 *
 * No real tool to delegate to here, unlike every other Bucket 1 check's
 * own D1 reasoning — DCO's entire spec is one stable, unchanging rule:
 * every commit needs a `Signed-off-by: Name <email>` trailer matching
 * its own author. This is a deliberate, narrow reimplementation of that
 * one rule, the same exception class `lint-editorconfig.ts`'s
 * `indent_style` handling already established for a spec too small and
 * stable to be worth a real dependency.
 *
 * Matches `dcoapp/app`'s own algorithm (`lib/dco.js`) for the common
 * case, confirmed directly against its source:
 * - A merge commit (more than one parent) is exempt entirely — it has
 *   no authorship of its own beyond its parents'.
 * - A bot-authored commit (`author?.type === "Bot"`) is exempt
 *   entirely — e.g. a prior Sentinel auto-fix-commit, Dependabot.
 * - A commit passes once any `Signed-off-by` trailer's name+email
 *   matches, case-insensitively, either the commit's author or
 *   committer identity (git's own recorded one, not the linked GitHub
 *   account).
 *
 * Deliberately NOT ported: `dcoapp`'s remediation-commit mechanism
 * (retroactively signing off on an already-merged commit via a special
 * trailer format in a later commit) and its org-membership/GPG-signature
 * exemption config. Neither is used anywhere in this org today — no
 * `.github/dco.yml` exists in any repo — and both add real parsing
 * complexity for a workflow nobody exercises. If this org ever needs
 * either, that's a deliberate follow-up, not a silent gap.
 *
 * Security boundary (D4/D6, same as `lint-commits.ts`): each commit's
 * message/author/committer identity comes from
 * `GitHubClient.pulls.listCommits()` — plain API metadata, no file
 * content and no code from the PR branch or fork ever read or run. Safe
 * from a fork PR, not just a same-repo one; this action needs no `ref`
 * parameter anywhere.
 */

import type { GitHubClient, GitHubPullRequestCommit } from "@theholocron/github-client";

export interface LintDcoInput {
	client: Pick<GitHubClient, "pulls">;
	/** `"owner/repo"`. */
	repo: string;
	pullNumber: number;
}

export interface DcoViolation {
	sha: string;
	/** The commit's own author name/email, exactly as git recorded it — shown so a contributor knows exactly what a matching trailer needs to say. */
	author: string;
}

export interface LintDcoResult {
	valid: boolean;
	/** Commits actually checked — a merge or bot-authored commit is exempt, so this can be smaller than the PR's total commit count. */
	commitCount: number;
	violations: DcoViolation[];
}

const SIGNOFF_RE = /^Signed-off-by: (.*) <(.*)>\s*$/gim;

/** Every `Signed-off-by: Name <email>` trailer in a commit message, lowercased for a case-insensitive identity comparison. */
function parseSignoffs(message: string): Array<{ name: string; email: string }> {
	SIGNOFF_RE.lastIndex = 0;
	const signoffs: Array<{ name: string; email: string }> = [];
	let match: RegExpExecArray | null;
	while ((match = SIGNOFF_RE.exec(message)) !== null) {
		signoffs.push({ name: match[1]!.toLowerCase(), email: match[2]!.toLowerCase() });
	}
	return signoffs;
}

/** True once any signoff's name+email matches the commit's own author or committer identity, case-insensitively. */
function isSignedOff(commit: GitHubPullRequestCommit): boolean {
	const identities = [commit.commit.author, commit.commit.committer].map((identity) => ({
		name: identity.name.toLowerCase(),
		email: identity.email.toLowerCase(),
	}));

	return parseSignoffs(commit.commit.message).some((signoff) =>
		identities.some((identity) => identity.name === signoff.name && identity.email === signoff.email)
	);
}

export async function lintDco(input: LintDcoInput): Promise<LintDcoResult> {
	const { client, repo, pullNumber } = input;
	const commits = await client.pulls.listCommits(repo, pullNumber);

	const checked = commits.filter((commit) => commit.parents.length <= 1 && commit.author?.type !== "Bot");

	const violations: DcoViolation[] = [];
	for (const commit of checked) {
		if (!isSignedOff(commit)) {
			violations.push({
				sha: commit.sha,
				author: `${commit.commit.author.name} <${commit.commit.author.email}>`,
			});
		}
	}

	return { valid: violations.length === 0, commitCount: checked.length, violations };
}
