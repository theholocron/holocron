import type { RestClient } from "../utils.js";

/** The Git repository a project is linked to. */
export interface VercelProjectLink {
	/** The Git provider, e.g. `github`. */
	type?: string;
	/** The provider's numeric repository id. */
	repoId?: number;
	/** The repository name. */
	repo?: string;
	/** The organization or user that owns the repository. */
	org?: string;
}

/** A Vercel project as the API returns it. */
export interface VercelProject {
	/** The project id. */
	id: string;
	/** The project name. */
	name: string;
	/** The framework preset, or `null` for none. */
	framework?: string | null;
	/** The directory in the repository the project builds from, or `null` for the root. */
	rootDirectory?: string | null;
	/** The linked Git repository, or `null` when there is none. */
	link?: VercelProjectLink | null;
}

/** The response of `projects.list()`. */
export interface VercelProjectsResponse {
	/** The projects the token can see. */
	projects: VercelProject[];
}

/** Input for `projects.create()`. */
export interface VercelCreateProjectInput {
	/** The project name. */
	name: string;
	/** The framework preset; omitted, none is sent. */
	framework?: string;
	/** A GitHub repository (`owner/name`) to link the project to. */
	repo?: string;
	/** The directory in the repository the project builds from. */
	rootDirectory?: string;
}

/** Input for `projects.update()`; only the fields given are sent. */
export interface VercelUpdateProjectInput {
	/** Turn preview deployments off (`true`) or on (`false`). */
	previewDeploymentsDisabled?: boolean;
	/** Git integration settings for the project. */
	gitProviderOptions?: {
		/** Whether (or when) Vercel creates deployments for pushes to the linked repository. */
		createDeployments?: boolean | string;
	};
}

export function projects(rest: RestClient) {
	return {
		list: (): Promise<VercelProjectsResponse> => rest.request<VercelProjectsResponse>("/v10/projects"),

		get: (nameOrId: string): Promise<VercelProject> =>
			rest.request<VercelProject>(`/v10/projects/${encodeURIComponent(nameOrId)}`),

		create: (input: VercelCreateProjectInput): Promise<VercelProject> => {
			const body: Record<string, unknown> = {
				name: input.name,
				...(input.framework !== undefined ? { framework: input.framework } : {}),
				...(input.repo ? { gitRepository: { type: "github", repo: input.repo } } : {}),
				...(input.rootDirectory ? { rootDirectory: input.rootDirectory } : {}),
			};
			return rest.request<VercelProject>("/v11/projects", {
				method: "POST",
				body,
			});
		},

		update: (projectId: string, input: VercelUpdateProjectInput): Promise<VercelProject> => {
			const body: Record<string, unknown> = {};
			if (input.previewDeploymentsDisabled !== undefined) {
				body.previewDeploymentsDisabled = input.previewDeploymentsDisabled;
			}
			if (input.gitProviderOptions !== undefined) {
				body.gitProviderOptions = input.gitProviderOptions;
			}
			return rest.request<VercelProject>(`/v9/projects/${encodeURIComponent(projectId)}`, {
				method: "PATCH",
				body,
			});
		},
	};
}
