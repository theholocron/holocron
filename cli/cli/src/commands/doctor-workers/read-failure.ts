import { type CheckRow, describeError } from "@theholocron/kyber/ui";

import { missingTokenReason } from "../missing-token/index.js";

/**
 * The row for a read that threw: a skip when the token is missing or the provider refused it (401, 403: the token may
 * simply not reach this), a failure for anything else. The status is read off the error rather than with `instanceof`,
 * because the CLI and a plugin may each hold their own copy of the error class.
 */
export function readFailureRow(id: string, title: string, err: unknown): CheckRow {
	const noToken = missingTokenReason(err);
	if (noToken !== undefined) return { id, title, status: "skip", detail: noToken, problems: [] };
	const status = (err as { status?: unknown } | null)?.status;
	if (status === 401 || status === 403) {
		return { id, title, status: "skip", detail: `not readable with this token (${status})`, problems: [] };
	}
	const detail = describeError(err);
	return { id, title, status: "fail", detail, problems: [detail] };
}
