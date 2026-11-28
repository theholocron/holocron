import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { createChecklyClient } from "../rest.js";
import { ChecklyMonitoring } from "./monitoring.js";

function make(responses: Array<{ status?: number; body?: unknown }>) {
	const stub = stubFetch(responses);
	const client = createChecklyClient({ token: "t", accountId: "acct-1", fetch: stub.fetch });
	return { capability: new ChecklyMonitoring(() => client, {}), stub };
}

const pages = { body: { length: 1, entries: [{ id: "p1", name: "The Holocron" }], nextId: null } };
const list = (entries: unknown[]) => ({ body: { length: entries.length, entries, nextId: null } });

describe("listIncidents", () => {
	it("reads an open incident with its updates, oldest first, and names components by id", async () => {
		const { capability, stub } = make([
			pages,
			list([{ id: "i1", name: "Sentinel down", lastUpdateStatus: "IDENTIFIED", created_at: "2026-11-20" }]),
			{
				body: {
					id: "i1",
					name: "Sentinel down",
					lastUpdateStatus: "IDENTIFIED",
					created_at: "2026-11-20T10:00:00Z",
					componentImpacts: [{ componentId: "c1", impact: "MAJOR_OUTAGE" }],
					incidentUpdates: [
						{ id: "u2", status: "IDENTIFIED", description: "found it", created_at: "2026-11-20T11:00:00Z" },
						{
							id: "u1",
							status: "INVESTIGATING",
							description: "looking",
							created_at: "2026-11-20T10:00:00Z",
						},
					],
				},
			},
			list([{ id: "c1", name: "Sentinel" }]),
		]);
		const [incident] = await capability.listIncidents({ statusPage: "The Holocron" });
		expect(incident).toMatchObject({
			id: "i1",
			title: "Sentinel down",
			status: "identified",
			impacts: [{ component: "Sentinel", impact: "major" }],
		});
		expect(incident?.updates.map((u) => u.id)).toEqual(["u1", "u2"]);
		expect(incident?.resolvedAt).toBeUndefined();
		expect(stub.calls).toHaveLength(4);
	});

	it("keeps a resolved incident's duration and resolution time, and skips ones resolved before `since`", async () => {
		const { capability } = make([
			pages,
			list([
				{
					id: "old",
					name: "Old",
					lastUpdateStatus: "RESOLVED",
					updated_at: "2026-11-01",
					created_at: "2026-11-01",
				},
				{
					id: "new",
					name: "New",
					lastUpdateStatus: "RESOLVED",
					updated_at: "2026-11-22",
					created_at: "2026-11-22",
				},
			]),
			{
				body: {
					id: "new",
					name: "New",
					duration: 600,
					created_at: "2026-11-22T10:00:00Z",
					componentImpacts: [{ name: "Docs", impact: "UNDER_MAINTENANCE" }],
					incidentUpdates: [
						{ id: "u1", status: "RESOLVED", description: "done", created_at: "2026-11-22T10:10:00Z" },
					],
				},
			},
		]);
		const incidents = await capability.listIncidents({ statusPage: "The Holocron", since: "2026-11-21T00:00:00Z" });
		expect(incidents).toHaveLength(1);
		expect(incidents[0]).toMatchObject({
			id: "new",
			status: "resolved",
			durationSeconds: 600,
			resolvedAt: "2026-11-22T10:10:00Z",
			impacts: [{ component: "Docs", impact: "maintenance" }],
		});
	});

	it("returns nothing when no incident qualifies, and fails for an unknown page", async () => {
		const empty = make([pages, list([])]);
		expect(await empty.capability.listIncidents({ statusPage: "The Holocron" })).toEqual([]);
		const missing = make([pages]);
		await expect(missing.capability.listIncidents({ statusPage: "Nope" })).rejects.toThrow(/not found/);
	});

	it("treats an update with an unknown status as investigating and an incident with no updates by its list status", async () => {
		const { capability } = make([
			pages,
			list([{ id: "i1", name: "X", created_at: "2026-11-20" }]),
			{ body: { id: "i1", name: "X", lastUpdateStatus: "MONITORING", created_at: "2026-11-20" } },
		]);
		const [incident] = await capability.listIncidents({ statusPage: "The Holocron" });
		expect(incident?.status).toBe("monitoring");
		expect(incident?.updates).toEqual([]);
		expect(incident?.impacts).toEqual([]);
	});
});
