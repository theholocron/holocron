/**
 * Status page incidents for the Checkly `monitoring` provider (spec `tech-incidents-to-discord`, #2366).
 *
 * Checkly lists a page's incidents with no updates, so each incident that is open, or was updated since the cut-off, is
 * read again for its updates. `updated_at` is typed as a date by Checkly and may carry no time of day, so the cut-off
 * compares days and never decides that an incident is unchanged: that is left to the caller's markers. Read-only.
 */

import type {
	MonitoringIncident,
	MonitoringIncidentImpact,
	MonitoringIncidentQuery,
	MonitoringIncidentStatus,
} from "@theholocron/cli";

import type { ChecklyClient, Incident, IncidentSummary, StatusRuleImpact } from "../rest.js";

export const IMPACTS: Record<StatusRuleImpact, MonitoringIncidentImpact> = {
	UNDER_MAINTENANCE: "maintenance",
	DEGRADED_PERFORMANCE: "degraded",
	PARTIAL_OUTAGE: "partial",
	MAJOR_OUTAGE: "major",
};

export function statusOf(status: string | undefined): MonitoringIncidentStatus {
	const lower = (status ?? "investigating").toLowerCase();
	return lower === "identified" || lower === "monitoring" || lower === "resolved" ? lower : "investigating";
}

/** True when the incident is still open or was updated on or after the day of `since`. */
function wanted(item: IncidentSummary, since: string | undefined): boolean {
	if (item.lastUpdateStatus !== "RESOLVED" || since === undefined || !item.updated_at) return true;
	return item.updated_at.slice(0, 10) >= since.slice(0, 10);
}

/** An incident as Checkly returns it, in the neutral shape; `names` maps a component id to its name. */
export function fromChecklyIncident(incident: Incident, names: ReadonlyMap<string, string>): MonitoringIncident {
	const updates = (incident.incidentUpdates ?? [])
		.map((u) => ({
			id: u.id,
			status: statusOf(u.status),
			text: u.description,
			at: u.publicIncidentUpdateDate ?? u.created_at,
		}))
		.sort((a, b) => a.at.localeCompare(b.at));
	const last = updates.at(-1);
	const status = last?.status ?? statusOf(incident.lastUpdateStatus);
	return {
		id: incident.id,
		title: incident.name,
		status,
		impacts: (incident.componentImpacts ?? []).map((c) => ({
			component: c.name ?? names.get(c.componentId ?? "") ?? c.componentId ?? "unknown",
			impact: IMPACTS[c.impact] ?? "degraded",
		})),
		startedAt: incident.created_at,
		...(status === "resolved" && last ? { resolvedAt: last.at } : {}),
		...(incident.duration != null ? { durationSeconds: incident.duration } : {}),
		updates,
	};
}

/** The incidents of the page named `query.statusPage`: every open one, and those updated since `query.since`. */
export async function listChecklyIncidents(
	client: ChecklyClient,
	query: MonitoringIncidentQuery
): Promise<MonitoringIncident[]> {
	const page = (await client.statusPages.list()).find((p) => p.name === query.statusPage);
	if (!page) throw new Error(`status page "${query.statusPage}" not found`);
	const summaries = (await client.statusPages.incidents.list(page.id)).filter((i) => wanted(i, query.since));
	if (summaries.length === 0) return [];
	const incidents = await Promise.all(summaries.map((i) => client.statusPages.incidents.get(page.id, i.id)));
	const needNames = incidents.some((i) => i.componentImpacts?.some((c) => !c.name));
	const names = new Map<string, string>();
	if (needNames) for (const c of await client.statusPages.components.list(page.id)) names.set(c.id, c.name);
	return incidents.map((i) => fromChecklyIncident(i, names));
}
