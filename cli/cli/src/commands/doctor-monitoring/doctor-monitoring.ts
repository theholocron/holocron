/**
 * `holocron doctor monitoring` — do the checks the `monitoring` provider declares exist in its account, as declared?
 *
 * Read-only. One row for the declared checks: each must exist by name, and what the config sets on it (URL, method,
 * frequency, locations, tags, activated, should-fail, body, assertions) must be what the provider holds. A setting the
 * config leaves out is not compared, and a check in the account that is not declared is never a problem, since the
 * account may hold checks made by hand or by another tool. Tags are compared one way: a declared tag the check
 * lacks fails, an extra tag on it does not. A provider that cannot list its checks, a missing
 * provider that failed to load, or a missing token is a skip with the reason, not a failure.
 *
 * One more `info` row, `monitoring-undeclared` (`undeclared-check-rows/`), names the account's checks that a declared
 * dashboard or status page component picks up by tag and that no config declares, the root's or a workspace package's
 * (`readWorkspaceMonitoring()`). It reuses the checks row's one read of the account and is never a failure.
 *
 * Heartbeats are one more row (`heartbeat-rows/`): each declared one must exist with the declared period and grace, and
 * the account's others are an `info` row. Names only.
 *
 * Out of scope: the alert channel and its subscriptions (the notification layout declares those, see
 * `doctor notifications`) and any check that a message really arrives.
 */
import {
	type CheckRow,
	declaredVsActual,
	printCheckRows,
	printCheckSummary,
	summariseChecks,
} from "@theholocron/kyber/ui";
import { errorMessage } from "@theholocron/misc-utils";

import { getLogger } from "../../observability/logger/index.js";
import {
	assertPluginsResolvable,
	type MonitoringAssertion,
	type MonitoringCheckInput,
	PluginLoader,
} from "../../plugin/index.js";
import { missingTokenReason } from "../missing-token/index.js";
import { whyMissing } from "../notifications-channel-add/index.js";
import { readWorkspaceMonitoring } from "../workspace-monitoring/index.js";
import { dashboardRows } from "./dashboard-rows/index.js";
import type { DoctorMonitoringReport, RunDoctorMonitoringInput } from "./doctor-monitoring.type.js";
import { heartbeatRows } from "./heartbeat-rows/index.js";
import { statusPageRows } from "./status-page-rows/index.js";
import { undeclaredCheckRows } from "./undeclared-check-rows/index.js";

const ID = "monitoring-checks";
const TITLE = "monitoring checks match";

export async function runDoctorMonitoring(input: RunDoctorMonitoringInput): Promise<DoctorMonitoringReport> {
	const print = input.print ?? ((line: string) => console.log(line));
	const logger = input.logger ?? getLogger();
	const loader = input.loader ?? new PluginLoader(input.loaded.resolved, input.context);
	await loader.load();
	assertPluginsResolvable(loader, "doctor monitoring");

	const checks = await checkRow(loader);
	const rows: CheckRow[] = [checks.row];
	if (loader.has("monitoring")) {
		const monitoring = loader.get("monitoring");
		const workspace = input.workspaceMonitoring ?? (await readWorkspaceMonitoring(input.context));
		rows.push(...undeclaredCheckRows({ monitoring, workspace, have: checks.have }));
	}
	if (loader.has("monitoring")) rows.push(...(await dashboardRows(loader.get("monitoring"))));
	if (loader.has("monitoring")) rows.push(...(await statusPageRows(loader.get("monitoring"))));
	rows.push(...(await heartbeatRowsOf(loader)));
	printCheckRows(rows, print);
	const summary = summariseChecks(rows);
	printCheckSummary(summary, print);
	const status = summary.fail > 0 ? "fail" : summary.ok === 0 ? "skip" : "ok";
	logger.info({ ...summary, status }, "doctor monitoring");
	return {
		status,
		rows,
		summary,
		...(status === "skip" ? { reason: rows.map((r) => r.detail).join("; ") } : {}),
	};
}

// ── helpers ──────────────────────────────────────────────────────────

/** The checks row and, when it read them, the checks the account holds (the one read `monitoring-undeclared` reuses). */
async function checkRow(loader: PluginLoader): Promise<{ row: CheckRow; have?: MonitoringCheckInput[] }> {
	const skip = (detail: string): { row: CheckRow } => ({
		row: { id: ID, title: TITLE, status: "skip", detail, problems: [] },
	});
	const none = (): { row: CheckRow } => ({
		row: { id: ID, title: TITLE, status: "ok", detail: "none declared", problems: [] },
	});
	if (!loader.has("monitoring")) {
		// A provider that is configured but failed to load is worth saying; none configured means nothing is declared.
		if (loader.loadFailures().some((f) => f.key === "monitoring")) {
			return skip(whyMissing(loader, "monitoring", "no `monitoring` provider is available"));
		}
		return none();
	}
	const monitoring = loader.get("monitoring");
	if (monitoring.checks.length === 0) return none();
	if (!monitoring.listChecks) return skip("provider does not implement listChecks");
	try {
		const have = await monitoring.listChecks();
		const problems = compareChecks(monitoring.checks, have);
		if (problems.length > 0) {
			return {
				row: { id: ID, title: TITLE, status: "fail", detail: `${problems.length} problem(s)`, problems },
				have,
			};
		}
		const n = monitoring.checks.length;
		return { row: { id: ID, title: TITLE, status: "ok", detail: `${n} of ${n} match`, problems: [] }, have };
	} catch (err) {
		const noToken = missingTokenReason(err);
		if (noToken !== undefined) return skip(noToken);
		return { row: { id: ID, title: TITLE, status: "fail", detail: errorMessage(err), problems: [] } };
	}
}

/** The heartbeat rows, only when a monitoring provider is loaded and declares heartbeats. */
async function heartbeatRowsOf(loader: PluginLoader): Promise<CheckRow[]> {
	return loader.has("monitoring") ? heartbeatRows(loader.get("monitoring")) : [];
}

/** One assertion as a line: `status_code equals 405`, `header[x-a] contains b`. */
function showAssertion(a: MonitoringAssertion): string {
	const subject = a.property === undefined ? a.source : `${a.source}[${a.property}]`;
	return [subject, a.comparison, ...(a.target === undefined ? [] : [a.target])].join(" ");
}

/** The settings of a check the config states, as comparable text; a setting it leaves out is not in the map. */
function settings(check: MonitoringCheckInput, declared: boolean): Map<string, string> {
	const out = new Map<string, string>();
	const set = (key: string, value: unknown, present: boolean) => {
		if (present) out.set(key, value === undefined ? "none" : String(value));
	};
	set("url", check.url, true);
	// An unstated method is a GET, as `ensureCheck` sends it.
	set("method", check.method ?? "GET", true);
	set("frequency", check.frequency, !declared || check.frequency !== undefined);
	set("activated", check.activated, !declared || check.activated !== undefined);
	set("shouldFail", check.shouldFail, !declared || check.shouldFail !== undefined);
	set("body", check.body, !declared || check.body !== undefined);
	set("locations", [...(check.locations ?? [])].sort().join(", "), !declared || check.locations !== undefined);
	set(
		"assertions",
		(check.assertions ?? []).map(showAssertion).sort().join("; "),
		!declared || check.assertions !== undefined
	);
	return out;
}

function compareChecks(declared: readonly MonitoringCheckInput[], have: readonly MonitoringCheckInput[]): string[] {
	const byName = new Map(have.map((c) => [c.name, c]));
	const problems = declaredVsActual(
		new Map(declared.map((c) => [c.name, c])),
		byName,
		// Presence only here; the settings are compared per check below.
		{ noun: "check", flagExtra: false, equal: () => true }
	);
	for (const want of declared) {
		const found = byName.get(want.name);
		if (!found) continue;
		const wanted = settings(want, true);
		const actual = new Map([...settings(found, false)].filter(([key]) => wanted.has(key)));
		problems.push(
			...declaredVsActual(wanted, actual, {
				noun: `check ${want.name}`,
				flagExtra: false,
				show: (value) => (value === "" ? "none" : value),
			})
		);
		// A declared tag the check lacks fails; an extra tag the account holds does not.
		if (want.tags !== undefined) {
			const tagMap = (tags: readonly string[] | undefined) => new Map((tags ?? []).map((t) => [t, t]));
			problems.push(
				...declaredVsActual(tagMap(want.tags), tagMap(found.tags), {
					noun: `check ${want.name} tag`,
					flagExtra: false,
				})
			);
		}
	}
	return problems;
}
