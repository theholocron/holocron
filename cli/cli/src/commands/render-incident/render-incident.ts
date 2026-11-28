import type { MonitoringIncident, MonitoringIncidentImpact, MonitoringIncidentUpdate } from "../../plugin/index.js";
import { incidentMarker, updateMarker } from "../incident-markers/index.js";
import type { RenderedIncident } from "./render-incident.type.js";

/** Discord's message limit is 2000; an update's text is cut well short of it, leaving room for its heading and marker. */
const UPDATE_TEXT_LIMIT = 1500;
const TITLE_LIMIT = 100;

const IMPACT_WORDS: Record<MonitoringIncidentImpact, string> = {
	maintenance: "under maintenance",
	degraded: "degraded",
	partial: "partial outage",
	major: "major outage",
};

const clip = (text: string, limit: number) => (text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text);

/** `2026-11-20T10:05:00Z` as `2026-11-20 10:05 UTC`; a bare date (Checkly may send no time) stays as it is. */
export function shownTime(at: string): string {
	const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(at);
	return match ? `${match[1]} ${match[2]} UTC` : at;
}

/** `1h 5m`, `45m` or `30s` for a length of time in seconds. */
export function shownDuration(seconds: number): string {
	const s = Math.max(0, Math.round(seconds));
	if (s < 60) return `${s}s`;
	const hours = Math.floor(s / 3600);
	const minutes = Math.floor((s % 3600) / 60);
	return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

/** The tag of an incident's post: its status, except `maintenance` while it is open and marks nothing else. */
export function incidentTag(incident: MonitoringIncident): string {
	const onlyMaintenance = incident.impacts.length > 0 && incident.impacts.every((i) => i.impact === "maintenance");
	return incident.status !== "resolved" && onlyMaintenance ? "maintenance" : incident.status;
}

/** The message one update is posted as: its status and time, the text, and the marker that says it was posted. */
export function renderIncidentUpdate(update: MonitoringIncidentUpdate): string {
	const text = clip(update.text.trim() || "(no text)", UPDATE_TEXT_LIMIT);
	return `**${update.status.toUpperCase()}**, ${shownTime(update.at)}\n${text}\n${updateMarker(update.id)}`;
}

/**
 * The post for an incident (spec `tech-incidents-to-discord`): the title, a summary as the first message (status,
 * what is affected, when it started, how long it lasted once resolved, a link to the status page) ending with the
 * incident's marker, and the tag. Pure. The incident has no URL of its own that is known, so the message links the page.
 */
export function renderIncident(
	incident: MonitoringIncident,
	statusPage: { name: string; url?: string }
): RenderedIncident {
	const tag = incidentTag(incident);
	const lines = [`**Status:** ${tag}`];
	if (incident.impacts.length > 0) {
		lines.push(
			`**Affected:** ${incident.impacts.map((i) => `${i.component} (${IMPACT_WORDS[i.impact]})`).join(", ")}`
		);
	}
	lines.push(`**Started:** ${shownTime(incident.startedAt)}`);
	if (incident.status === "resolved") {
		if (incident.resolvedAt) lines.push(`**Resolved:** ${shownTime(incident.resolvedAt)}`);
		if (incident.durationSeconds !== undefined)
			lines.push(`**Lasted:** ${shownDuration(incident.durationSeconds)}`);
	}
	lines.push(
		statusPage.url ? `Status page: [${statusPage.name}](<${statusPage.url}>)` : `Status page: ${statusPage.name}`
	);
	lines.push(incidentMarker(incident.id));
	return { title: clip(incident.title, TITLE_LIMIT), body: lines.join("\n"), tag };
}
