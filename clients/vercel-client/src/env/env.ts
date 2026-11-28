import type { RestClient } from "../utils.js";

/** An environment a variable applies to. */
export type VercelEnvTarget = "production" | "preview" | "development";

/** An environment variable on a project, as the API lists it. */
export interface VercelEnvVar {
	/** The variable's id. */
	id: string;
	/** The variable's name. */
	key: string;
	/** The environments the variable applies to. */
	target: VercelEnvTarget[];
}

/** The response of `env.list()`. */
export interface VercelEnvVarsResponse {
	/** The project's environment variables. */
	envs: VercelEnvVar[];
}

export function env(rest: RestClient) {
	return {
		list: (projectId: string): Promise<VercelEnvVarsResponse> =>
			rest.request<VercelEnvVarsResponse>(`/v9/projects/${encodeURIComponent(projectId)}/env`),

		set: (projectId: string, target: VercelEnvTarget, name: string, value: string): Promise<VercelEnvVar> =>
			rest.request<VercelEnvVar>(`/v10/projects/${encodeURIComponent(projectId)}/env`, {
				method: "POST",
				query: { upsert: "true" },
				body: {
					key: name,
					value,
					target: [target],
					type: "encrypted",
				},
			}),
	};
}
