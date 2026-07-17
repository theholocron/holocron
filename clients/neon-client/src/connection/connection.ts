import type { RestClient } from "../utils.js";

export interface NeonConnectionUriParams {
	branch_id: string;
	database_name: string;
	role_name: string;
	pooled?: "true" | "false";
}

export interface NeonConnectionUriResponse {
	uri: string;
}

export function connection(rest: RestClient) {
	return {
		uri: (
			projectId: string,
			params: NeonConnectionUriParams,
		): Promise<NeonConnectionUriResponse> => {
			const query: Record<string, string> = {
				branch_id: params.branch_id,
				database_name: params.database_name,
				role_name: params.role_name,
			};
			if (params.pooled !== undefined) query["pooled"] = params.pooled;
			return rest.request<NeonConnectionUriResponse>(
				`/projects/${projectId}/connection_uri`,
				{ query },
			);
		},
	};
}
