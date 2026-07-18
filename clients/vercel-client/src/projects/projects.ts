import type { RestClient } from "../utils.js";

export interface VercelProjectLink {
	type?: string;
	repoId?: number;
	repo?: string;
	org?: string;
}

export interface VercelProject {
	id: string;
	name: string;
	framework?: string | null;
	rootDirectory?: string | null;
	link?: VercelProjectLink | null;
}

export interface VercelProjectsResponse {
	projects: VercelProject[];
}

export interface VercelCreateProjectInput {
	name: string;
	framework?: string;
	repo?: string;
	rootDirectory?: string;
}

export interface VercelUpdateProjectInput {
	previewDeploymentsDisabled?: boolean;
	gitProviderOptions?: { createDeployments?: string };
}

export function projects(rest: RestClient) {
	return {
		list: (): Promise<VercelProjectsResponse> =>
			rest.request<VercelProjectsResponse>("/v10/projects"),

		get: (nameOrId: string): Promise<VercelProject> =>
			rest.request<VercelProject>(
				`/v10/projects/${encodeURIComponent(nameOrId)}`,
			),

		create: (input: VercelCreateProjectInput): Promise<VercelProject> => {
			const body: Record<string, unknown> = {
				name: input.name,
				...(input.framework !== undefined
					? { framework: input.framework }
					: {}),
				...(input.repo
					? { gitRepository: { type: "github", repo: input.repo } }
					: {}),
				...(input.rootDirectory
					? { rootDirectory: input.rootDirectory }
					: {}),
			};
			return rest.request<VercelProject>("/v11/projects", {
				method: "POST",
				body,
			});
		},

		update: (
			projectId: string,
			input: VercelUpdateProjectInput,
		): Promise<VercelProject> => {
			const body: Record<string, unknown> = {};
			if (input.previewDeploymentsDisabled !== undefined) {
				body.previewDeploymentsDisabled =
					input.previewDeploymentsDisabled;
			}
			if (input.gitProviderOptions !== undefined) {
				body.gitProviderOptions = input.gitProviderOptions;
			}
			return rest.request<VercelProject>(
				`/v9/projects/${encodeURIComponent(projectId)}`,
				{ method: "PATCH", body },
			);
		},
	};
}
