import { ProviderApiError } from "@theholocron/http-client";

import type { RestClient } from "../utils.js";
import { segment } from "../utils.js";

export type VariableScope =
	{ kind: "repo" } | { kind: "environment"; name: string } | { kind: "organization"; org: string };

/**
 * Which repositories of an organization can read a variable. Only organization variables have one. This client does
 * not read or set the repositories behind `"selected"`; use `"all"` or `"private"` where the access has to be reconciled.
 */
export type VariableVisibility = "all" | "private" | "selected";

/** A GitHub Actions variable. Unlike a secret its value is readable, so a reconcile can tell whether it differs. */
export interface GitHubVariable {
	name: string;
	value: string;
	/** Present on organization variables only. */
	visibility?: VariableVisibility;
}

interface VariablesListResponse {
	total_count: number;
	variables: GitHubVariable[];
}

/** GitHub's maximum page size for this listing is 30, not the usual 100. */
const PAGE = 30;
/** A guard so a runaway listing cannot loop forever: 100 pages of 30 is more than GitHub allows. */
const MAX_PAGES = 100;

/** `/repos/owner/name`, refusing anything but exactly two safe segments, so a caller's `repo` cannot address another resource. */
function repoPath(repo: string): string {
	const parts = repo.split("/");
	if (parts.length !== 2) throw new Error(`invalid repository: ${JSON.stringify(repo)} (expected "owner/name")`);
	return `/repos/${parts.map(segment).join("/")}`;
}

function scopeBase(repo: string, scope: VariableScope): string {
	switch (scope.kind) {
		case "repo":
			return `${repoPath(repo)}/actions/variables`;
		case "environment":
			return `${repoPath(repo)}/environments/${segment(scope.name)}/variables`;
		case "organization":
			return `/orgs/${segment(scope.org)}/actions/variables`;
	}
}

export function variables(rest: RestClient) {
	return {
		/** Every variable in the scope, read page by page, with its value. */
		listVariables: async (repo: string, scope: VariableScope): Promise<GitHubVariable[]> => {
			const path = scopeBase(repo, scope);
			const all: GitHubVariable[] = [];
			for (let page = 1; page <= MAX_PAGES; page++) {
				const batch = await rest.request<VariablesListResponse>(path, {
					query: { per_page: String(PAGE), page: String(page) },
				});
				all.push(...batch.variables);
				if (batch.variables.length < PAGE || all.length >= batch.total_count) return all;
			}
			throw new Error(`more than ${MAX_PAGES * PAGE} variables in ${path}; refusing to read them all`);
		},

		/** One variable, or `null` when the scope has none of that name. */
		getVariable: async (repo: string, scope: VariableScope, name: string): Promise<GitHubVariable | null> => {
			try {
				return await rest.request<GitHubVariable>(`${scopeBase(repo, scope)}/${segment(name)}`);
			} catch (err) {
				if (err instanceof ProviderApiError && err.status === 404) return null;
				throw err;
			}
		},

		createVariable: (repo: string, scope: VariableScope, body: Record<string, unknown>): Promise<void> =>
			rest.request<void>(scopeBase(repo, scope), {
				method: "POST",
				body,
				expectNoContent: true,
			}),

		updateVariable: async (
			repo: string,
			scope: VariableScope,
			name: string,
			body: Record<string, unknown>
		): Promise<void> =>
			rest.request<void>(`${scopeBase(repo, scope)}/${segment(name)}`, {
				method: "PATCH",
				body: { name, ...body },
				expectNoContent: true,
			}),

		deleteVariable: async (repo: string, scope: VariableScope, name: string): Promise<void> =>
			rest.request<void>(`${scopeBase(repo, scope)}/${segment(name)}`, {
				method: "DELETE",
				expectNoContent: true,
			}),
	};
}
