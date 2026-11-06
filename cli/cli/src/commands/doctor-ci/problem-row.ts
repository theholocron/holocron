import type { CheckRow } from "@theholocron/kyber/ui";

/** A row that fails with its problems, or passes with `okDetail` when there are none. */
export function problemRow(id: string, title: string, problems: string[], okDetail: string): CheckRow {
	if (problems.length > 0) {
		return { id, title, status: "fail", detail: `${problems.length} problem(s)`, problems };
	}
	return { id, title, status: "ok", detail: okDetail, problems: [] };
}
