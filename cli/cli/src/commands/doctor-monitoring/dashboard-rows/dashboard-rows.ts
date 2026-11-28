import type { CheckRow } from "@theholocron/kyber/ui";
import { errorMessage } from "@theholocron/misc-utils";

import type { Monitoring, MonitoringDashboardInput, MonitoringDashboardState } from "../../../plugin/index.js";
import { missingTokenReason } from "../../missing-token/index.js";

const ID = "monitoring-dashboards";
const TITLE = "monitoring dashboards match";

/** The tags as comparable text: sorted and de-duplicated. */
const tagsText = (tags: readonly string[]): string => [...new Set(tags)].sort().join(", ") || "none";

/** What differs between a declared dashboard and the one the account holds. Privacy is always compared (default private). */
function problemsFor(want: MonitoringDashboardInput, have: MonitoringDashboardState): string[] {
	if (!have.exists) return [`missing dashboard ${want.name}`];
	const problems: string[] = [];
	const wantPrivate = want.private ?? true;
	if ((have.private ?? false) !== wantPrivate) {
		const now = have.private ? "private" : "public";
		problems.push(
			wantPrivate
				? `dashboard ${want.name} is public but declared private: anyone with the link can read it`
				: `dashboard ${want.name}: declared public, found ${now}`
		);
	}
	if (tagsText(want.tags) !== tagsText(have.tags ?? [])) {
		problems.push(
			`dashboard ${want.name} tags: declared ${tagsText(want.tags)}, found ${tagsText(have.tags ?? [])}`
		);
	}
	if (want.domain !== undefined && want.domain !== have.domain) {
		problems.push(`dashboard ${want.name} domain: declared ${want.domain}, found ${have.domain ?? "none"}`);
	}
	return problems;
}

/**
 * The `doctor monitoring` rows for dashboards: none when the config declares none. One row compares each declared
 * dashboard (exists, privacy, tags, domain; a public dashboard declared private is a failure), and an `info` row
 * (a skipped one) names dashboards the account holds that the config does not. A provider that cannot inspect, or a
 * missing token, is a skip with the reason.
 */
export async function dashboardRows(monitoring: Monitoring): Promise<CheckRow[]> {
	const declared = monitoring.dashboards ?? [];
	if (declared.length === 0) return [];
	const skip = (id: string, title: string, detail: string): CheckRow => ({
		id,
		title,
		status: "skip",
		detail,
		problems: [],
	});
	if (!monitoring.inspectDashboard) return [skip(ID, TITLE, "provider does not implement inspectDashboard")];
	try {
		const names = new Set(declared.map((d) => d.name));
		const problems: string[] = [];
		const extra = new Set<string>();
		for (const want of declared) {
			const have = await monitoring.inspectDashboard(want.name);
			problems.push(...problemsFor(want, have));
			for (const other of have.others) if (!names.has(other)) extra.add(other);
		}
		const row: CheckRow =
			problems.length > 0
				? { id: ID, title: TITLE, status: "fail", detail: `${problems.length} problem(s)`, problems }
				: {
						id: ID,
						title: TITLE,
						status: "ok",
						detail: `${declared.length} of ${declared.length} match`,
						problems: [],
					};
		const rows = [row];
		if (extra.size > 0) {
			rows.push(
				skip(
					"monitoring-dashboards-extra",
					"other dashboards on the account",
					`not declared: ${[...extra].sort().join(", ")}`
				)
			);
		}
		return rows;
	} catch (err) {
		const noToken = missingTokenReason(err);
		if (noToken !== undefined) return [skip(ID, TITLE, noToken)];
		return [{ id: ID, title: TITLE, status: "fail", detail: errorMessage(err), problems: [] }];
	}
}
