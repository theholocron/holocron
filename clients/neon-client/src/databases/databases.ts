import type { RestClient } from "../utils.js";

export interface NeonDatabase {
	id: number;
	name: string;
	owner_name: string;
}

export interface NeonDatabasesResponse {
	databases: NeonDatabase[];
}

export function databases(rest: RestClient) {
	return {
		list: (
			projectId: string,
			branchId: string,
		): Promise<NeonDatabasesResponse> =>
			rest.request<NeonDatabasesResponse>(
				`/projects/${projectId}/branches/${encodeURIComponent(branchId)}/databases`,
			),

		runSql: (
			projectId: string,
			branchId: string,
			dbName: string,
			query: string,
		): Promise<void> =>
			rest.request<void>(
				`/projects/${projectId}/branches/${encodeURIComponent(branchId)}/databases/${encodeURIComponent(dbName)}/run_sql`,
				{ method: "POST", body: { query } },
			),
	};
}
