import type { RestClient } from "../utils.js";

export interface NeonBranch {
	id: string;
	name: string;
	parent_id?: string;
	created_at: string;
}

export interface NeonBranchesResponse {
	branches: NeonBranch[];
}

export interface NeonBranchResponse {
	branch: NeonBranch;
}

export interface CreateNeonBranchInput {
	name: string;
	parent_id?: string;
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
