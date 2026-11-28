import type { RestClient } from "../utils.js";

/** A database on a Neon branch. */
export interface NeonDatabase {
	/** The database's numeric id. */
	id: number;
	/** The database name. */
	name: string;
	/** The name of the role that owns the database. */
	owner_name: string;
}

/** The response of listing a branch's databases. */
export interface NeonDatabasesResponse {
	/** The branch's databases. */
	databases: NeonDatabase[];
}

export function databases(rest: RestClient) {
	return {
		list: (projectId: string, branchId: string): Promise<NeonDatabasesResponse> =>
			rest.request<NeonDatabasesResponse>(
				`/projects/${projectId}/branches/${encodeURIComponent(branchId)}/databases`
			),

		runSql: (projectId: string, branchId: string, dbName: string, query: string): Promise<void> =>
			rest.request<void>(
				`/projects/${projectId}/branches/${encodeURIComponent(branchId)}/databases/${encodeURIComponent(dbName)}/run_sql`,
				{ method: "POST", body: { query } }
			),
	};
}
