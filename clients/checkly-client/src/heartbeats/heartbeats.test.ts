import { stubFetch } from "@theholocron/http-client/testing";
import { describe, expect, it } from "vitest";

import { createChecklyClient } from "../index.js";

const BASE = "https://checkly.test/v1";
// An obviously fake address: a real ping URL is a credential.
const FAKE_PING = "https://ping.invalid/00000000-0000-0000-0000-000000000000";

function client(responses: Parameters<typeof stubFetch>[0]) {
	const { fetch, calls } = stubFetch(responses);
	return {
		heartbeats: createChecklyClient({ token: "tok", accountId: "acct-1", baseUrl: BASE, fetch }).heartbeats,
		calls,
	};
}

const beat = {
	id: "hb-1",
	name: "check-tokens",
	checkType: "HEARTBEAT" as const,
	activated: true,
	tags: ["ci"],
	heartbeat: { period: 1, periodUnit: "days" as const, grace: 2, graceUnit: "hours" as const, pingUrl: FAKE_PING },
	created_at: "2026-01-01T00:00:00.000Z",
	updated_at: null,
};

describe("heartbeats.list", () => {
	it("GETs /checks and keeps only heartbeat checks", async () => {
		const { heartbeats, calls } = client([{ body: [{ id: "x", name: "api", checkType: "API" }, beat] }]);
		const result = await heartbeats.list({ search: "check", limit: 100, page: 2 });
		expect(result).toEqual([beat]);
		const url = decodeURIComponent(calls[0]!.url);
		expect(url).toContain(`${BASE}/checks`);
		expect(url).toContain("search=check");
		expect(url).toContain("limit=100");
		expect(url).toContain("page=2");
	});

	it("sends no query when none is given", async () => {
		const { heartbeats, calls } = client([{ body: [] }]);
		await heartbeats.list();
		expect(calls[0]?.url).not.toContain("?");
	});
});

describe("heartbeats.listAll", () => {
	it("pages until a page is short and keeps only heartbeats", async () => {
		const full = Array.from({ length: 100 }, (_, i) => ({ id: `a${i}`, name: `api ${i}`, checkType: "API" }));
		const { heartbeats, calls } = client([{ body: [...full.slice(1), beat] }, { body: [beat] }]);
		const result = await heartbeats.listAll();
		expect(result).toHaveLength(2);
		expect(calls).toHaveLength(2);
		expect(calls[1]?.url).toContain("page=2");
	});
});

describe("heartbeats.create", () => {
	it("POSTs /checks/heartbeat and returns the check with its ping URL", async () => {
		const { heartbeats, calls } = client([{ status: 201, body: beat }]);
		const input = {
			name: beat.name,
			heartbeat: { period: 1, periodUnit: "days" as const, grace: 2, graceUnit: "hours" as const },
		};
		const result = await heartbeats.create(input);
		expect(result.heartbeat.pingUrl).toBe(FAKE_PING);
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toBe(`${BASE}/checks/heartbeat`);
		expect(calls[0]?.body).toEqual(input);
	});
});

describe("heartbeats.update", () => {
	it("PUTs /checks/heartbeat/{id}", async () => {
		const { heartbeats, calls } = client([{ body: beat }]);
		await heartbeats.update("hb-1", { name: beat.name, heartbeat: beat.heartbeat });
		expect(calls[0]?.method).toBe("PUT");
		expect(calls[0]?.url).toBe(`${BASE}/checks/heartbeat/hb-1`);
	});
});
