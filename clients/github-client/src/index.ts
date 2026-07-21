import { createGitHubRestClient, type GitHubClientOptions } from "./utils.js";
import { branches } from "./branches/branches.js";
import { environments } from "./environments/environments.js";
import { git } from "./git/git.js";
import { issues } from "./issues/issues.js";
import { labels } from "./labels/labels.js";
import { properties } from "./properties/properties.js";
import { repos } from "./repos/repos.js";
import { rulesets } from "./rulesets/rulesets.js";
import { secrets } from "./secrets/secrets.js";
import { security } from "./security/security.js";
import { teams } from "./teams/teams.js";
import { topics } from "./topics/topics.js";
import { user } from "./user/user.js";
import { workflows } from "./workflows/workflows.js";

export type { GitHubClientOptions } from "./utils.js";

export type { GitHubContents, GitHubRepo } from "./repos/repos.js";
export type { CodeScanningSetupResult } from "./security/security.js";
export type { GitHubRuleset } from "./rulesets/rulesets.js";
export type {
	GitHubWorkflowRun,
	WorkflowRunFilter,
} from "./workflows/workflows.js";
export type { GitHubPublicKey, SecretScope } from "./secrets/secrets.js";
export type { GitHubEnvironment } from "./environments/environments.js";
export type {
	GitHubIssue,
	GitHubMilestone,
	IssueSearchParams,
} from "./issues/issues.js";
export type { GitHubLabel } from "./labels/labels.js";
export type {
	CreatePullInput,
	GitBlob,
	GitCommit,
	GitContents,
	GitPull,
	GitRef,
	GitTree,
	GitTreeItem,
} from "./git/git.js";
export type { GitHubUser } from "./user/user.js";
export type { TeamPermission } from "./teams/teams.js";

export function createGitHubClient(opts: GitHubClientOptions) {
	const rest = createGitHubRestClient(opts);
	return {
		branches: branches(rest),
		environments: environments(rest),
		git: git(rest),
		issues: issues(rest),
		labels: labels(rest),
		properties: properties(rest),
		repos: repos(rest),
		rulesets: rulesets(rest),
		secrets: secrets(rest),
		security: security(rest),
		teams: teams(rest),
		topics: topics(rest),
		user: user(rest),
		workflows: workflows(rest),
	};
}

export type GitHubClient = ReturnType<typeof createGitHubClient>;
