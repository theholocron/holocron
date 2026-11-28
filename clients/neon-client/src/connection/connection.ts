import type { RestClient } from "../utils.js";

/** Which branch, database and role to build a connection URI for. */
export interface NeonConnectionUriParams {
	/** The id of the branch to connect to. */
	branch_id: string;
	/** The name of the database to connect to. */
	database_name: string;
	/** The name of the role to connect as. */
	role_name: string;
	/** Whether to ask for the pooled connection string: `"true"` or `"false"`; left out, the parameter is not sent. */
	pooled?: "true" | "false";
}

/** The response of asking for a connection URI. */
export interface NeonConnectionUriResponse {
	/** The Postgres connection URI. */
	uri: string;
}

export function connection(rest: RestClient) {
	return {
		uri: (projectId: string, params: NeonConnectionUriParams): Promise<NeonConnectionUriResponse> => {
			const query: Record<string, string> = {
				branch_id: params.branch_id,
				database_name: params.database_name,
				role_name: params.role_name,
			};
			if (params.pooled !== undefined) query["pooled"] = params.pooled;
			return rest.request<NeonConnectionUriResponse>(`/projects/${projectId}/connection_uri`, { query });
		},
	};
}
