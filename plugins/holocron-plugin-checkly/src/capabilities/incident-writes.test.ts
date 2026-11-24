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
const base = { statusPage: "The Holocron", message: "Looking", notify: false };

describe("openIncident", () => {
	it("opens an incident with its one update and the components it marks, found by name", async () => {
		const { capability, stub } = make([
			pages,
			list([
				{ id: "c1", name: "Sentinel" },
				{ id: "c2", name: "Docs" },
			]),
			{ status: 201, body: { id: "i1", name: "Down", lastUpdateStatus: "INVESTIGATING" } },
		]);
		const written = await capability.openIncident({
			...base,
			title: "Down",
			status: "investigating",
			notify: true,
			impacts: [
				{ component: "Sentinel", impact: "major" },
				{ component: "Docs", impact: "degraded" },
			],
		});
		expect(written).toEqual({ id: "i1", status: "investigating" });
		expect(stub.calls[2]).toMatchObject({
			method: "POST",
			url: "https://api.checklyhq.com/v3/status-pages/p1/incidents",
		});
		expect(stub.calls[2]?.body).toEqual({
			name: "Down",
			incidentUpdates: [{ description: "Looking", status: "INVESTIGATING", notifySubscribers: true }],
			componentImpacts: [
				{ componentId: "c1", status: "MAJOR_OUTAGE" },
				{ componentId: "c2", status: "DEGRADED_PERFORMANCE" },
			],
		});
	});

	it("reads no components and sends no impacts when none is marked, and answers the status it sent", async () => {
		const { capability, stub } = make([pages, { status: 201, body: { id: "i2", name: "Quiet" } }]);
		const written = await capability.openIncident({ ...base, title: "Quiet", status: "identified", impacts: [] });
		expect(written).toEqual({ id: "i2", status: "identified" });
		expect(stub.calls).toHaveLength(2);
		expect(stub.calls[1]?.body).not.toHaveProperty("componentImpacts");
	});

	it("names every unknown component and the ones the page has, before anything is written", async () => {
		const { capability, stub } = make([pages, list([{ id: "c1", name: "Sentinel" }])]);
		const err = await capability
			.openIncident({
				...base,
				title: "Down",
				status: "investigating",
				impacts: [
					{ component: "Nope", impact: "major" },
					{ component: "Also", impact: "partial" },
				],
			})
			.catch((e: unknown) => e);
		expect((err as Error).message).toMatch(/no component named "Nope", "Also" \(it has Sentinel\)/);
		expect(stub.calls).toHaveLength(2);
	});

	it("says a page with no components has none", async () => {
		const { capability } = make([pages, list([])]);
		await expect(
			capability.openIncident({
				...base,
				title: "Down",
				status: "investigating",
				impacts: [{ component: "Sentinel", impact: "major" }],
			})
		).rejects.toThrow(/it has none/);
	});

	it("refuses a title Checkly would cut, and a page it does not have", async () => {
		const long = make([]);
		await expect(
			long.capability.openIncident({ ...base, title: "x".repeat(256), status: "investigating", impacts: [] })
		).rejects.toThrow(/at most 255 characters \(this one is 256\)/);
		expect(long.stub.calls).toHaveLength(0);
		const missing = make([pages]);
		await expect(
			missing.capability.openIncident({
				...base,
				statusPage: "Nope",
				title: "x",
				status: "investigating",
				impacts: [],
			})
		).rejects.toThrow(/not found/);
	});
});

describe("updateIncident and resolveIncident", () => {
	it("appends an update with the status given", async () => {
		const { capability, stub } = make([pages, { status: 201, body: { id: "i1", lastUpdateStatus: "MONITORING" } }]);
		const written = await capability.updateIncident({ ...base, id: "i1", status: "monitoring", notify: true });
		expect(written).toEqual({ id: "i1", status: "monitoring" });
		expect(stub.calls[1]).toMatchObject({
			method: "POST",
			url: "https://api.checklyhq.com/v3/status-pages/p1/incidents/i1/incident-updates",
		});
		expect(stub.calls[1]?.body).toEqual({ description: "Looking", status: "MONITORING", notifySubscribers: true });
	});

	it("resolves with a RESOLVED update whatever status the input carries", async () => {
		const { capability, stub } = make([pages, { status: 201, body: { id: "i1", lastUpdateStatus: "RESOLVED" } }]);
		const written = await capability.resolveIncident({ ...base, id: "i1", status: "investigating" });
		expect(written).toEqual({ id: "i1", status: "resolved" });
		expect(stub.calls[1]?.body).toMatchObject({ status: "RESOLVED" });
	});

	it("answers the status it sent when Checkly returns none", async () => {
		const { capability } = make([pages, { status: 201, body: { id: "i1" } }]);
		expect((await capability.resolveIncident({ ...base, id: "i1", status: "resolved" })).status).toBe("resolved");
	});
});
