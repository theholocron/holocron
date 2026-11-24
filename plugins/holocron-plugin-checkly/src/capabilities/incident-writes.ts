/**
 * Writing status page incidents for the Checkly `monitoring` provider (spec `tech-open-status-page-incidents`, #2591).
 *
 * A page and its components are named in the config, never by id, so each write finds the page by name and, when it marks
 * components, reads the page's components once to turn names into ids. The neutral status and impact words are
 * translated to Checkly's here. Checkly has no resolve endpoint: a `RESOLVED` update closes an incident.
 */

import type {
	MonitoringIncidentImpact,
	MonitoringIncidentInput,
	MonitoringIncidentStatus,
	MonitoringIncidentUpdateInput,
	MonitoringIncidentWrite,
} from "@theholocron/cli";

import type { ChecklyClient, IncidentComponentImpactInput, IncidentUpdateStatus, StatusRuleImpact } from "../rest.js";
import { IMPACTS, statusOf } from "./incidents.js";

const STATUSES: Record<MonitoringIncidentStatus, IncidentUpdateStatus> = {
	investigating: "INVESTIGATING",
	identified: "IDENTIFIED",
	monitoring: "MONITORING",
	resolved: "RESOLVED",
};

/** The neutral impact word for each Checkly impact, turned around. */
const CHECKLY_IMPACTS = Object.fromEntries(
	Object.entries(IMPACTS).map(([checkly, neutral]) => [neutral, checkly])
) as Record<MonitoringIncidentImpact, StatusRuleImpact>;

/** The longest incident name Checkly accepts. */
const MAX_NAME = 255;

async function pageId(client: ChecklyClient, name: string): Promise<string> {
	const page = (await client.statusPages.list()).find((p) => p.name === name);
	if (!page) throw new Error(`status page "${name}" not found`);
	return page.id;
}

async function impactsOf(
	client: ChecklyClient,
	id: string,
	impacts: MonitoringIncidentInput["impacts"]
): Promise<IncidentComponentImpactInput[]> {
	if (impacts.length === 0) return [];
	const components = await client.statusPages.components.list(id);
	const ids = new Map(components.map((c) => [c.name, c.id]));
	const unknown = impacts.filter((i) => !ids.has(i.component)).map((i) => i.component);
	if (unknown.length > 0) {
		throw new Error(
			`status page has no component named ${unknown.map((n) => `"${n}"`).join(", ")} (it has ${[...ids.keys()].join(", ") || "none"})`
		);
	}
	return impacts.map((i) => ({ componentId: ids.get(i.component)!, status: CHECKLY_IMPACTS[i.impact] }));
}

/** Opens an incident with its one opening update; the components it marks are looked up by name. */
export async function openChecklyIncident(
	client: ChecklyClient,
	input: MonitoringIncidentInput
): Promise<MonitoringIncidentWrite> {
	if (input.title.length > MAX_NAME) {
		throw new Error(`an incident title is at most ${MAX_NAME} characters (this one is ${input.title.length})`);
	}
	const id = await pageId(client, input.statusPage);
	const componentImpacts = await impactsOf(client, id, input.impacts);
	const incident = await client.statusPages.incidents.create(id, {
		name: input.title,
		incidentUpdates: [
			{ description: input.message, status: STATUSES[input.status], notifySubscribers: input.notify },
		],
		...(componentImpacts.length > 0 ? { componentImpacts } : {}),
	});
	return { id: incident.id, status: statusOf(incident.lastUpdateStatus ?? STATUSES[input.status]) };
}

/** Appends an update with the status `input.status`. */
export async function updateChecklyIncident(
	client: ChecklyClient,
	input: MonitoringIncidentUpdateInput
): Promise<MonitoringIncidentWrite> {
	const id = await pageId(client, input.statusPage);
	const incident = await client.statusPages.incidents.addUpdate(id, input.id, {
		description: input.message,
		status: STATUSES[input.status],
		notifySubscribers: input.notify,
	});
	return { id: incident.id, status: statusOf(incident.lastUpdateStatus ?? STATUSES[input.status]) };
}

/** Appends a `RESOLVED` update, which is how Checkly closes an incident. */
export function resolveChecklyIncident(
	client: ChecklyClient,
	input: MonitoringIncidentUpdateInput
): Promise<MonitoringIncidentWrite> {
	return updateChecklyIncident(client, { ...input, status: "resolved" });
}
