/**
 * The heartbeat rows of `doctor monitoring`: each declared heartbeat must exist with the declared period and grace
 * (a tag the config states is compared too; one it leaves out is not), and a heartbeat the account holds beyond the
 * config is an `info` row (shown as skipped). Names only: the ping URL is never read here.
 */
import { type CheckRow, declaredVsActual } from "@theholocron/kyber/ui";
import { errorMessage } from "@theholocron/misc-utils";

import type { Monitoring, MonitoringHeartbeatInput } from "../../../plugin/index.js";
import { missingTokenReason } from "../../missing-token/index.js";

const ID = "monitoring-heartbeats";
const TITLE = "monitoring heartbeats match";

const show = (b: MonitoringHeartbeatInput): Map<string, string> =>
	new Map([
		["period", `${b.period} ${b.periodUnit}`],
		["grace", `${b.grace} ${b.graceUnit}`],
		...(b.tags === undefined ? [] : [["tags", [...b.tags].sort().join(", ") || "none"] as [string, string]]),
	]);

/** No rows when the provider declares no heartbeats: the doctor then prints what it always did. */
export async function heartbeatRows(monitoring: Monitoring): Promise<CheckRow[]> {
	const declared = monitoring.heartbeats ?? [];
	if (declared.length === 0) return [];
	const skip = (detail: string): CheckRow => ({ id: ID, title: TITLE, status: "skip", detail, problems: [] });
	if (!monitoring.listHeartbeats) return [skip("provider does not implement listHeartbeats")];
	try {
		const have = new Map((await monitoring.listHeartbeats()).map((b) => [b.name, b]));
		const problems = declaredVsActual(new Map(declared.map((b) => [b.name, b])), have, {
			noun: "heartbeat",
			flagExtra: false,
			equal: () => true,
		});
		for (const want of declared) {
			const found = have.get(want.name);
			if (!found) continue;
			const wanted = show(want);
			const actual = new Map([...show(found)].filter(([key]) => wanted.has(key)));
			problems.push(...declaredVsActual(wanted, actual, { noun: `heartbeat ${want.name}`, flagExtra: false }));
		}
		const rows: CheckRow[] = [
			problems.length > 0
				? { id: ID, title: TITLE, status: "fail", detail: `${problems.length} problem(s)`, problems }
				: {
						id: ID,
						title: TITLE,
						status: "ok",
						detail: `${declared.length} of ${declared.length} match`,
						problems: [],
					},
		];
		const declaredNames = new Set(declared.map((b) => b.name));
		const extras = [...have.keys()].filter((name) => !declaredNames.has(name)).sort();
		if (extras.length > 0) {
			rows.push({
				id: `${ID}-extra`,
				title: "heartbeats beyond the config",
				status: "skip",
				detail: `info: the account also holds ${extras.length}: ${extras.join(", ")}`,
				problems: [],
			});
		}
		return rows;
	} catch (err) {
		const noToken = missingTokenReason(err);
		if (noToken !== undefined) return [skip(noToken)];
		return [{ id: ID, title: TITLE, status: "fail", detail: errorMessage(err), problems: [] }];
	}
}
