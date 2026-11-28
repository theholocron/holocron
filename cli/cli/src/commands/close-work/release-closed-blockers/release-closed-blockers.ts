import { type CheckRow, describeError } from "@theholocron/kyber/ui";

import type { ReleaseClosedBlockersInput } from "./release-closed-blockers.type.js";

const row = (id: string, status: CheckRow["status"], detail: string): CheckRow => ({
	id,
	title: id,
	status,
	detail,
	problems: [],
});

/**
 * Takes the blockers that have since closed off an issue's blocked-by list (a closed blocker unblocks). A blocker still
 * open stays, and an issue with none says so. Reads each time, so a second run with nothing left to release changes
 * nothing.
 */
export async function releaseClosedBlockers(input: ReleaseClosedBlockersInput): Promise<CheckRow[]> {
	const { issues, key } = input;
	if (!issues.export)
		return [row("relations", "skip", `the \`${issues.providerName}\` provider cannot read blockers`)];
	try {
		const blockers = (await issues.export({ keys: [key] }))[0]?.blockedBy ?? [];
		if (blockers.length === 0) return [row("relations", "skip", `${key} has no blockers`)];
		const closed = (await issues.export({ keys: blockers })).filter((r) => r.closed).map((r) => r.key);
		if (closed.length === 0) {
			return [
				row(
					"relations",
					"skip",
					`${blockers.length} blocker${blockers.length === 1 ? "" : "s"} still open: ${blockers.join(", ")}`
				),
			];
		}
		const done = await input.unblock(closed);
		return [
			row(
				"relations",
				done.status === "fail" ? "fail" : "ok",
				`closed ${closed.length === 1 ? "blocker" : "blockers"} ${closed.join(", ")} taken off ${key}`
			),
			...done.rows.filter((r) => r.status === "fail"),
		];
	} catch (err) {
		return [row("relations", "fail", `could not update the blockers: ${describeError(err)}`)];
	}
}
