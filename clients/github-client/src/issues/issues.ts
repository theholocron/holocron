import type { RestClient } from "../utils.js";
import { repoBase } from "../utils.js";

/** An issue as GitHub returns it, with only the fields this client reads. */
export interface GitHubIssue {
	/** The issue's numeric id. */
	id: number;
	/** The issue's number within its repository. */
	number: number;
	/** The issue's title. */
	title: string;
	/** The issue's description; `null` or absent when empty. */
	body?: string | null;
	/** Whether the issue is open or closed. */
	state: "open" | "closed";
	/** The labels on the issue. */
	labels: Array<{ name: string }>;
	/** The user the issue is assigned to, or `null` when unassigned. */
	assignee: {
		login: string;
		name?: string | null;
		email?: string | null;
	} | null;
	/** When the issue was last updated, as an ISO 8601 timestamp. */
	updated_at: string;
	/** The URL of the issue's page on GitHub. */
	html_url: string;
	/** Set when the item is a pull request; GitHub's issues API returns pull requests too. */
	pull_request?: unknown;
}

/** A milestone, with only the fields this client reads. */
export interface GitHubMilestone {
	/** The milestone's number. */
	number: number;
	/** The milestone's title. */
	title: string;
}

/** Filters for listing issues. */
export interface IssueSearchParams {
	/** Which issues to list by state; GitHub defaults to `open`. */
	state?: "open" | "closed" | "all";
	/** The field to sort by, passed through to GitHub. */
	sort?: string;
	/** The sort direction, passed through to GitHub. */
	direction?: string;
	/** The number of issues per page. */
	per_page?: number;
	/** Which issues to list by relation to the user, passed through to GitHub. */
	filter?: string;
	/** Limit to issues assigned to this login. */
	assignee?: string;
}

export function issues(rest: RestClient) {
	return {
		listIssues: (repo: string, params: IssueSearchParams = {}): Promise<GitHubIssue[]> => {
			const qs = new URLSearchParams();
			if (params.state) qs.set("state", params.state);
			if (params.sort) qs.set("sort", params.sort);
			if (params.direction) qs.set("direction", params.direction);
			if (params.per_page) qs.set("per_page", String(params.per_page));
			if (params.filter) qs.set("filter", params.filter);
			if (params.assignee) qs.set("assignee", params.assignee);
			const q = qs.toString();
			const path = q ? `${repoBase(repo)}/issues?${q}` : `${repoBase(repo)}/issues`;
			return rest.request<GitHubIssue[]>(path);
		},

		getIssue: (repo: string, number: number): Promise<GitHubIssue> =>
			rest.request<GitHubIssue>(`${repoBase(repo)}/issues/${number}`),

		createIssue: (repo: string, body: Record<string, unknown>): Promise<GitHubIssue> =>
			rest.request<GitHubIssue>(`${repoBase(repo)}/issues`, {
				method: "POST",
				body,
			}),

		updateIssue: (repo: string, number: number, body: Record<string, unknown>): Promise<GitHubIssue> =>
			rest.request<GitHubIssue>(`${repoBase(repo)}/issues/${number}`, {
				method: "PATCH",
				body,
			}),

		addLabels: (repo: string, number: number, labels: string[]): Promise<void> =>
			rest.request<void>(`${repoBase(repo)}/issues/${number}/labels`, {
				method: "POST",
				body: { labels },
			}),

		removeLabel: (repo: string, number: number, label: string): Promise<void> =>
			rest.request<void>(`${repoBase(repo)}/issues/${number}/labels/${encodeURIComponent(label)}`, {
				method: "DELETE",
			}),

		createComment: (repo: string, number: number, body: string): Promise<void> =>
			rest.request<void>(`${repoBase(repo)}/issues/${number}/comments`, {
				method: "POST",
				body: { body },
			}),

		listMilestones: (
			repo: string,
			params: { state?: "open" | "closed" | "all" } = {}
		): Promise<GitHubMilestone[]> => {
			const qs = new URLSearchParams({ per_page: "100" });
			if (params.state) qs.set("state", params.state);
			return rest.request<GitHubMilestone[]>(`${repoBase(repo)}/milestones?${qs.toString()}`);
		},
	};
}
