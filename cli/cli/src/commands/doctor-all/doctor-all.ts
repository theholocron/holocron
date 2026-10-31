/**
 * `holocron doctor --all` — run every deep check and print one row for each.
 *
 * A check's own steps are not printed (they are what `holocron doctor <name>` is for); a failing row says so.
 * A check that cannot run because a provider or token is missing is a skip with the reason. Any other error
 * fails that check alone, and the rest still run. The run fails when any check failed.
 */

import { errorMessage } from "@theholocron/misc-utils";

import { getLogger } from "../../observability/logger/index.js";
import { MissingTokenError, WorkspaceContextError } from "../../plugin/index.js";
import { DEEP_CHECKS, type DeepCheck, type DeepCheckOutcome } from "../deep-checks/index.js";
import { type CheckRow, printCheckRows, printCheckSummary, summariseChecks } from "../doctor-checks/index.js";
import type { DoctorAllReport, RunDoctorAllInput } from "./doctor-all.type.js";

export async function runDoctorAll(input: RunDoctorAllInput): Promise<DoctorAllReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const logger = input.logger ?? getLogger();
	const checks = input.checks ?? DEEP_CHECKS;

	const rows: CheckRow[] = [];
	for (const check of checks) {
		rows.push(toRow(check, await outcomeOf(check, input)));
	}

	printCheckRows(rows, print);
	const summary = summariseChecks(rows);
	printCheckSummary(summary, print);

	const status = summary.fail > 0 ? "fail" : summary.ok === 0 ? "skip" : "ok";
	logger.info({ ...summary, status, checks: rows.map((r) => `${r.id}:${r.status}`) }, "doctor --all");
	return { status, rows, summary };
}

// ── helpers ──────────────────────────────────────────────────────────

/** Runs one check silently. A missing token is a skip; any other error is that check's failure. */
async function outcomeOf(check: DeepCheck, input: RunDoctorAllInput): Promise<DeepCheckOutcome> {
	try {
		return await check.run({
			loaded: input.loaded,
			context: input.context,
			print: () => {},
			...(input.logger ? { logger: input.logger } : {}),
		});
	} catch (err) {
		// Not being in a repo with the plugins is the whole command's problem, not one check's.
		if (err instanceof WorkspaceContextError) throw err;
		if (err instanceof MissingTokenError) {
			return { status: "skip", summary: { ok: 0, fail: 0, skip: 1 }, reason: err.message };
		}
		return { status: "fail", summary: { ok: 0, fail: 1, skip: 0 }, reason: errorMessage(err) };
	}
}

function toRow(check: DeepCheck, outcome: DeepCheckOutcome): CheckRow {
	const { ok, fail, skip } = outcome.summary;
	const counts = [`${ok} ok`, ...(fail > 0 ? [`${fail} failed`] : []), ...(skip > 0 ? [`${skip} skipped`] : [])].join(
		", "
	);
	return {
		id: check.name,
		title: check.name,
		status: outcome.status,
		detail: outcome.status === "ok" ? counts : (outcome.reason ?? counts),
		problems: outcome.status === "fail" ? [`run \`holocron doctor ${check.name}\` for the steps`] : [],
	};
}
