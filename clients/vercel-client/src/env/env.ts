import type { RestClient } from "../utils.js";

export type VercelEnvTarget = "production" | "preview" | "development";

export interface VercelEnvVar {
	id: string;
	key: string;
	target: VercelEnvTarget[];
}

export interface VercelEnvVarsResponse {
	envs: VercelEnvVar[];
}

export function env(rest: RestClient) {
	return {
		list: (projectId: string): Promise<VercelEnvVarsResponse> =>
			rest.request<VercelEnvVarsResponse>(
				`/v9/projects/${encodeURIComponent(projectId)}/env`,
			),

		set: (
			projectId: string,
			target: VercelEnvTarget,
			name: string,
			value: string,
		): Promise<VercelEnvVar> =>
			rest.request<VercelEnvVar>(
				`/v10/projects/${encodeURIComponent(projectId)}/env`,
				{
					method: "POST",
					query: { upsert: "true" },
					body: {
						key: name,
						value,
						target: [target],
						type: "encrypted",
					},
				},
			),
	};
}
