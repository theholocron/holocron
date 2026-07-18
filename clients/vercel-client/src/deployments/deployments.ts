import type { RestClient } from "../utils.js";

export type VercelDeploymentState =
	| "INITIALIZING"
	| "QUEUED"
	| "BUILDING"
	| "READY"
	| "ERROR"
	| "CANCELED";

export type VercelDeploymentTarget = "production" | "staging";

export interface VercelDeployment {
	id: string;
	url: string;
	readyState: VercelDeploymentState;
	target?: VercelDeploymentTarget | null;
	meta?: { githubCommitRef?: string };
}

export interface VercelTriggerDeploymentInput {
	projectName: string;
	branch: string;
	repoId: number;
	target?: VercelDeploymentTarget;
}

export function deployments(rest: RestClient) {
	return {
		trigger: (
			input: VercelTriggerDeploymentInput,
		): Promise<VercelDeployment> =>
			rest.request<VercelDeployment>("/v13/deployments", {
				method: "POST",
				body: {
					name: input.projectName,
					gitSource: {
						type: "github",
						ref: input.branch,
						repoId: input.repoId,
					},
					...(input.target ? { target: input.target } : {}),
				},
			}),

		get: (deploymentId: string): Promise<VercelDeployment> =>
			rest.request<VercelDeployment>(
				`/v13/deployments/${encodeURIComponent(deploymentId)}`,
			),
	};
}
