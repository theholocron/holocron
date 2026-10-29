import type { RestClient } from "../utils.js";

/**
 * Where a check stands after its latest run, from `GET /v1/check-statuses/{checkId}`. A check that has not run yet has
 * no run id, and Checkly may answer 404 for it, so callers wait for `lastCheckRunId` before trusting the flags.
 */
export interface CheckStatus {
	checkId: string;
	name?: string;
	/** The latest run failed. */
	hasFailures: boolean;
	/** The latest run errored (it could not be carried out), as distinct from failing its assertions. */
	hasErrors?: boolean;
	isDegraded?: boolean;
	/** Null or absent until the check has run. */
	lastCheckRunId?: string | null;
	lastRunLocation?: string | null;
	created_at?: string;
	updated_at?: string | null;
}

export function checkStatuses(rest: RestClient) {
	return {
		/** The latest status of one check. Throws ProviderApiError 404 if Checkly has none yet (the check has not run). */
		get: (checkId: string): Promise<CheckStatus> =>
			rest.request<CheckStatus>(`/check-statuses/${encodeURIComponent(checkId)}`),
	};
}
