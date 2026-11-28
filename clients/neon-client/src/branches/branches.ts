import type { RestClient } from "../utils.js";

/** A Neon branch of a project, as the Neon API returns it. */
export interface NeonBranch {
	/** The branch id, such as `br-...`. */
	id: string;
	/** The branch name. */
	name: string;
	/** The id of the branch this one was created from; `undefined` for a root branch. */
	parent_id?: string;
	/** When the branch was created, as an ISO 8601 timestamp. */
	created_at: string;
}

/** The response of listing a project's branches. */
export interface NeonBranchesResponse {
	/** The project's branches. */
	branches: NeonBranch[];
}

/** The response of creating a branch. */
export interface NeonBranchResponse {
	/** The branch that was created. */
	branch: NeonBranch;
}

/** What to create a branch with. */
export interface CreateNeonBranchInput {
	/** The name of the new branch. */
	name: string;
	/** The id of the branch to create it from; left out, no parent is sent. */
	parent_id?: string;
	/** Compute endpoints to create with the branch, each read-write or read-only; left out, none are sent. */
	endpoints?: Array<{ type: "read_write" | "read_only" }>;
}

export function branches(rest: RestClient) {
	return {
		list: (projectId: string): Promise<NeonBranchesResponse> =>
			rest.request<NeonBranchesResponse>(`/projects/${projectId}/branches`),

		create: (projectId: string, input: CreateNeonBranchInput): Promise<NeonBranchResponse> =>
			rest.request<NeonBranchResponse>(`/projects/${projectId}/branches`, {
				method: "POST",
				body: {
					branch: {
						name: input.name,
						...(input.parent_id !== undefined ? { parent_id: input.parent_id } : {}),
					},
					...(input.endpoints !== undefined ? { endpoints: input.endpoints } : {}),
				},
			}),

		destroy: (projectId: string, branchId: string): Promise<void> =>
			rest.request<void>(`/projects/${projectId}/branches/${encodeURIComponent(branchId)}`, {
				method: "DELETE",
			}),

		restore: (projectId: string, branchId: string, sourceBranchId: string): Promise<void> =>
			rest.request<void>(`/projects/${projectId}/branches/${encodeURIComponent(branchId)}/restore`, {
				method: "POST",
				body: { source_branch_id: sourceBranchId },
			}),
	};
}
