import { describe, expect, it } from "vitest";

import type { MonitoringIncident } from "../../plugin/index.js";
import { incidentTag, renderIncident, renderIncidentUpdate, shownDuration, shownTime } from "./render-incident.js";

const incident = (over: Partial<MonitoringIncident> = {}): MonitoringIncident => ({
	id: "i1",
	title: "Sentinel is down",
	status: "investigating",
	impacts: [{ component: "Sentinel", impact: "major" }],
	startedAt: "2026-11-20T10:05:00.000Z",
	updates: [],
	...over,
});

describe("shownTime and shownDuration", () => {
	it("trims a timestamp to the minute and leaves a bare date alone", () => {
		expect(shownTime("2026-11-20T10:05:33.000Z")).toBe("2026-11-20 10:05 UTC");
		expect(shownTime("2026-11-20")).toBe("2026-11-20");
	});

	it("writes hours, minutes and seconds", () => {
		expect(shownDuration(30)).toBe("30s");
		expect(shownDuration(45 * 60)).toBe("45m");
		expect(shownDuration(3900)).toBe("1h 5m");
		expect(shownDuration(-5)).toBe("0s");
	});
});

describe("incidentTag", () => {
	it("is the status, or maintenance while an incident that only marks maintenance is open", () => {
		expect(incidentTag(incident({ status: "identified" }))).toBe("identified");
		const maintenance = incident({ impacts: [{ component: "Docs", impact: "maintenance" }] });
		expect(incidentTag(maintenance)).toBe("maintenance");
		expect(incidentTag({ ...maintenance, status: "resolved" })).toBe("resolved");
		expect(incidentTag(incident({ impacts: [] }))).toBe("investigating");
	});
});

describe("renderIncident", () => {
	it("summarises an open incident and ends with its marker", () => {
		const rendered = renderIncident(incident(), { name: "The Holocron", url: "https://status.example.com" });
		expect(rendered.title).toBe("Sentinel is down");
		expect(rendered.tag).toBe("investigating");
		expect(rendered.body.split("\n")).toEqual([
			"**Status:** investigating",
			"**Affected:** Sentinel (major outage)",
			"**Started:** 2026-11-20 10:05 UTC",
			"Status page: [The Holocron](<https://status.example.com>)",
			"-# incident: i1",
		]);
	});

	it("adds when it was resolved and how long it lasted, and names the page with no link when none is known", () => {
		const rendered = renderIncident(
			incident({ status: "resolved", resolvedAt: "2026-11-20T11:10:00Z", durationSeconds: 3900 }),
			{ name: "The Holocron" }
		);
		expect(rendered.body).toContain("**Resolved:** 2026-11-20 11:10 UTC");
		expect(rendered.body).toContain("**Lasted:** 1h 5m");
		expect(rendered.body).toContain("Status page: The Holocron\n");
		expect(rendered.tag).toBe("resolved");
	});

	it("leaves out the affected line for an incident that marks nothing and cuts a long title", () => {
		const rendered = renderIncident(incident({ impacts: [], title: "x".repeat(300) }), { name: "P" });
		expect(rendered.body).not.toContain("Affected");
		expect(rendered.title).toHaveLength(100);
		expect(rendered.title.endsWith("…")).toBe(true);
	});
});

describe("renderIncidentUpdate", () => {
	it("posts the status, the time, the text and the update's marker", () => {
		expect(
			renderIncidentUpdate({ id: "u1", status: "identified", text: " found it ", at: "2026-11-20T10:30:00Z" })
		).toBe("**IDENTIFIED**, 2026-11-20 10:30 UTC\nfound it\n-# update: u1");
	});

	it("cuts a long text and says so for an empty one", () => {
		const long = renderIncidentUpdate({ id: "u", status: "monitoring", text: "y".repeat(5000), at: "2026-11-20" });
		expect(long.length).toBeLessThan(1700);
		expect(renderIncidentUpdate({ id: "u", status: "monitoring", text: "  ", at: "2026-11-20" })).toContain(
			"(no text)"
		);
	});
});
