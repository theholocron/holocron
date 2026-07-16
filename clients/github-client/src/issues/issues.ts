import type { RestClient } from "../utils.js";
import { repoBase } from "../utils.js";

export interface GitHubIssue {
	id: number;
	number: number;
	title: string;
	body?: string | null;
	state: "open" | "closed";
	labels: Array<{ name: string }>;
	assignee: {
		login: string;
		name?: string | null;
		email?: string | null;
	} | null;
	updated_at: string;
	html_url: string;
	pull_request?: unknown;
}

export interface GitHubMilestone {
	number: number;
	title: string;
}

export interface IssueSearchParams {
	state?: "open" | "closed" | "all";
	sort?: string;
	direction?: string;
	per_page?: number;
	filter?: string;
	assignee?: string;
}

export function issues(rest: RestClient) {
	return {
		listIssues: (
			repo: string,
			params: IssueSearchParams = {},
		): Promise<GitHubIssue[]> => {
			const qs = new URLSearchParams();
			if (params.state) qs.set("state", params.state);
			if (params.sort) qs.set("sort", params.sort);
			if (params.direction) qs.set("direction", params.direction);
			if (params.per_page) qs.set("per_page", String(params.per_page));
			if (params.filter) qs.set("filter", params.filter);
			if (params.assignee) qs.set("assignee", params.assignee);
			const q = qs.toString();
			const path = q
				? `${repoBase(repo)}/issues?${q}`
				: `${repoBase(repo)}/issues`;
			return rest.request<GitHubIssue[]>(path);
		},

		getIssue: (repo: string, number: number): Promise<GitHubIssue> =>
			rest.request<GitHubIssue>(`${repoBase(repo)}/issues/${number}`),

		createIssue: (
			repo: string,
			body: Record<string, unknown>,
		): Promise<GitHubIssue> =>
			rest.request<GitHubIssue>(`${repoBase(repo)}/issues`, {
				method: "POST",
				body,
			}),

		updateIssue: (
			repo: string,
			number: number,
			body: Record<string, unknown>,
		): Promise<GitHubIssue> =>
			rest.request<GitHubIssue>(`${repoBase(repo)}/issues/${number}`, {
				method: "PATCH",
				body,
			}),

		addLabels: (
			repo: string,
			number: number,
			labels: string[],
		): Promise<void> =>
			rest.request<void>(`${repoBase(repo)}/issues/${number}/labels`, {
				method: "POST",
				body: { labels },
			}),

		removeLabel: (
			repo: string,
			number: number,
			label: string,
		): Promise<void> =>
			rest.request<void>(
				`${repoBase(repo)}/issues/${number}/labels/${encodeURIComponent(label)}`,
				{ method: "DELETE" },
			),

		createComment: (
			repo: string,
			number: number,
			body: string,
		): Promise<void> =>
			rest.request<void>(`${repoBase(repo)}/issues/${number}/comments`, {
				method: "POST",
				body: { body },
			}),

		listMilestones: (
			repo: string,
			params: { state?: "open" | "closed" | "all" } = {},
		): Promise<GitHubMilestone[]> => {
			const qs = new URLSearchParams({ per_page: "100" });
			if (params.state) qs.set("state", params.state);
			return rest.request<GitHubMilestone[]>(
				`${repoBase(repo)}/milestones?${qs.toString()}`,
			);
		},
	};
}
