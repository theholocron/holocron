import type { CheckRow, CheckSummary } from "../check-row/index.js";

/** How many rows ended each way. */
export function summariseChecks(rows: readonly CheckRow[]): CheckSummary {
	return {
		ok: rows.filter((r) => r.status === "ok").length,
		fail: rows.filter((r) => r.status === "fail").length,
		skip: rows.filter((r) => r.status === "skip").length,
	};
}
